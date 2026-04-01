from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Header
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
# ... other imports ...

app = FastAPI(title="AI Timetable Generator")

# Initialize templates folder
templates = Jinja2Templates(directory="templates")

# Important: Define the router
router = APIRouter()
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

import random
import copy
import pandas as pd
import os
import json
import math

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Text as SAText, Text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy import UniqueConstraint

from passlib.context import CryptContext
from jose import jwt, JWTError


# =========================
# SECURITY CONFIG
# =========================

SECRET_KEY = "supersecretkey"
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security    = HTTPBearer()


def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def create_token(data: dict):
    to_encode = data.copy()
    expire    = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload  = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# =========================
# DATABASE
# =========================

DATABASE_URL = "sqlite:///./timetable.db"

engine       = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()


# =========================
# DATABASE TABLES
# =========================

class UserDB(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String, unique=True)
    password      = Column(String)
    full_name     = Column(String,  nullable=True)
    branch        = Column(String,  nullable=True)
    job_role      = Column(String,  nullable=True)
    qualification = Column(String,  nullable=True)
    avatar        = Column(SAText,  nullable=True)


class TeacherDB(Base):
    __tablename__ = "teachers"
    id      = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    code    = Column(String, nullable=False)
    name    = Column(String, nullable=False)
    __table_args__ = (UniqueConstraint("user_id", "code", name="uq_user_teacher_code"),)


class SubjectDB(Base):
    __tablename__ = "subjects"
    id        = Column(Integer, primary_key=True)
    user_id   = Column(Integer, ForeignKey("users.id"), nullable=False)
    name      = Column(String)
    type      = Column(String)
    hours     = Column(Integer)
    lab_hours = Column(Integer, nullable=True)
    # NEW: link subjects to a specific year-branch
    yb_key    = Column(String, nullable=True)


class YearBranchDB(Base):
    __tablename__ = "year_branches"
    id             = Column(Integer, primary_key=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    year           = Column(String, nullable=False)
    branch         = Column(String, nullable=False)
    divisions_json = Column(Text,   nullable=False)


class TimetableDB(Base):
    __tablename__ = "timetables"
    id        = Column(Integer, primary_key=True)
    user_id   = Column(Integer, ForeignKey("users.id"), nullable=False)
    yb_key    = Column(String,  nullable=False)
    data_json = Column(Text,    nullable=False)
    __table_args__ = (UniqueConstraint("user_id", "yb_key", name="uq_user_yb"),)


class AssignmentDB(Base):
    """
    Stores teacher/room assignments per subject per division.
    For core_lab subjects, batch_assigns_json holds a JSON list:
      [{ "batch":"A1", "teacher_code":"...", "room":"..." }, ...]
    For theory/elective, teacher_code and room are plain strings.
    """
    __tablename__ = "assignments"
    id                 = Column(Integer, primary_key=True)
    user_id            = Column(Integer, ForeignKey("users.id"), nullable=False)
    yb_key             = Column(String,  nullable=False)
    division           = Column(String,  nullable=False)
    subject_name       = Column(String,  nullable=False)
    teacher_code       = Column(String,  nullable=True)
    room               = Column(String,  nullable=True)
    batch_assigns_json = Column(Text,    nullable=True)


# ── Rooms table ───────────────────────────────────────────────────────────────
class RoomDB(Base):
    __tablename__ = "rooms"
    id      = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    number  = Column(String, nullable=False)
    type    = Column(String, nullable=False)   # "classroom" | "lab"
    __table_args__ = (UniqueConstraint("user_id", "number", name="uq_user_room"),)


# ── NEW: Teacher Load table ───────────────────────────────────────────────────
class TeacherLoadDB(Base):
    """Max theory + practical sessions per teacher per week."""
    __tablename__ = "teacher_loads"
    id            = Column(Integer, primary_key=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    teacher_code  = Column(String, nullable=False)
    max_theory    = Column(Integer, nullable=True)    # None = no limit
    max_practical = Column(Integer, nullable=True)    # None = no limit
    __table_args__ = (UniqueConstraint("user_id", "teacher_code", name="uq_user_tload"),)


# ── NEW: Personal Timetable table ─────────────────────────────────────────────
class PersonalTimetableDB(Base):
    """A teacher's self-declared fixed/pinned slots."""
    __tablename__ = "personal_timetables"
    id            = Column(Integer, primary_key=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    teacher_code  = Column(String, nullable=False)
    # JSON shape: { "Monday": { "9-10": { "subject":"OS", "room":"304", "yb_key":"SE-IT", "div":"A" } } }
    slots_json    = Column(Text, nullable=False, default="{}")
    __table_args__ = (UniqueConstraint("user_id", "teacher_code", name="uq_user_ptt"),)


Base.metadata.create_all(bind=engine)


# =========================
# SCHEMA MIGRATION
# =========================

def run_migrations():
    with engine.connect() as conn:
        sa = __import__("sqlalchemy")

        def existing_cols(table_name):
            r = conn.execute(sa.text(f"PRAGMA table_info({table_name})"))
            return [row[1] for row in r.fetchall()]

        def existing_tables():
            r = conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))
            return [row[0] for row in r.fetchall()]

        tables = existing_tables()

        # users
        user_cols = existing_cols("users")
        for col, coltype in [
            ("full_name","TEXT"),("branch","TEXT"),("job_role","TEXT"),
            ("qualification","TEXT"),("avatar","TEXT"),
        ]:
            if col not in user_cols:
                conn.execute(sa.text(f"ALTER TABLE users ADD COLUMN {col} {coltype}"))

        # subjects
        sub_cols = existing_cols("subjects")
        if "user_id" not in sub_cols:
            conn.execute(sa.text("ALTER TABLE subjects ADD COLUMN user_id INTEGER REFERENCES users(id)"))
        if "lab_hours" not in sub_cols:
            conn.execute(sa.text("ALTER TABLE subjects ADD COLUMN lab_hours INTEGER"))
        if "yb_key" not in sub_cols:
            conn.execute(sa.text("ALTER TABLE subjects ADD COLUMN yb_key TEXT"))

        # assignments
        assign_cols = existing_cols("assignments")
        if "room" not in assign_cols:
            conn.execute(sa.text("ALTER TABLE assignments ADD COLUMN room TEXT"))
        if "batch_assigns_json" not in assign_cols:
            conn.execute(sa.text("ALTER TABLE assignments ADD COLUMN batch_assigns_json TEXT"))

        # rooms table (created by Base.metadata.create_all above, but guard anyway)
        if "rooms" not in tables:
            conn.execute(sa.text(
                "CREATE TABLE rooms (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL "
                "REFERENCES users(id), number TEXT NOT NULL, type TEXT NOT NULL)"
            ))

        # ── NEW: teacher_loads table ──────────────────────────────────────────
        if "teacher_loads" not in tables:
            conn.execute(sa.text(
                "CREATE TABLE teacher_loads ("
                "id INTEGER PRIMARY KEY, "
                "user_id INTEGER NOT NULL REFERENCES users(id), "
                "teacher_code TEXT NOT NULL, "
                "max_theory INTEGER, "
                "max_practical INTEGER)"
            ))

        # ── NEW: personal_timetables table ───────────────────────────────────
        if "personal_timetables" not in tables:
            conn.execute(sa.text(
                "CREATE TABLE personal_timetables ("
                "id INTEGER PRIMARY KEY, "
                "user_id INTEGER NOT NULL REFERENCES users(id), "
                "teacher_code TEXT NOT NULL, "
                "slots_json TEXT NOT NULL DEFAULT '{}')"
            ))

        conn.commit()

run_migrations()


# =========================
# FASTAPI APP
# =========================

app = FastAPI(title="AI Timetable Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user_id(username: str, db: Session) -> int:
    user = db.query(UserDB).filter(UserDB.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user.id


# =========================
# PYDANTIC MODELS
# =========================

class Subject(BaseModel):
    name:      str
    type:      str
    hours:     int
    lab_hours: Optional[int] = None

class TeacherModel(BaseModel):
    code: str
    name: str

class RoomModel(BaseModel):
    number: str
    type:   str   # "classroom" | "lab"

class BatchAssign(BaseModel):
    batch:        str
    teacher_code: str = ""
    room:         str = ""

class GenerateInput(BaseModel):
    year:      str
    branch:    str
    divisions: List[str]
    subjects:  List[Subject]
    teacher_assignments: Optional[Dict[str, Dict[str, Any]]] = {}
    timetables: Optional[Dict[str, Dict]] = None

class UserSignup(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class ProfileUpdate(BaseModel):
    full_name:     Optional[str] = None
    branch:        Optional[str] = None
    job_role:      Optional[str] = None
    qualification: Optional[str] = None
    avatar:        Optional[str] = None
    new_username:  Optional[str] = None
    new_password:  Optional[str] = None

# Save subjects independently (with yb_key)
class SaveSubjectsInput(BaseModel):
    yb_key:   str
    subjects: List[Subject]

# ── NEW: Pydantic models for load management & personal timetable ─────────────
class TeacherLoadModel(BaseModel):
    teacher_code:  str
    max_theory:    Optional[int] = None
    max_practical: Optional[int] = None

class PersonalTimetableInput(BaseModel):
    teacher_code: str
    # { day: { slot: { subject, room, yb_key, div } } }
    slots: Dict[str, Dict[str, Any]]


# =========================
# AUTH ROUTES
# =========================

@router.post("/signup")
def signup(user: UserSignup, db: Session = Depends(get_db)):
    if db.query(UserDB).filter(UserDB.username == user.username).first():
        raise HTTPException(status_code=400, detail="User already exists")
    db.add(UserDB(username=user.username, password=hash_password(user.password)))
    db.commit()
    return {"message": "User created successfully"}


@router.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.username == user.username).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid username")
    if not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=400, detail="Invalid password")
    return {"access_token": create_token({"sub": user.username}), "token_type": "bearer"}


@router.get("/me")
def get_me(username: str = Depends(verify_token)):
    return {"username": username}


@router.get("/profile")
def get_profile(username: str = Depends(verify_token), db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.username == username).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    return {
        "username": user.username, "full_name": user.full_name or "",
        "branch": user.branch or "", "job_role": user.job_role or "",
        "qualification": user.qualification or "", "avatar": user.avatar or "",
    }


@router.put("/profile")
def update_profile(data: ProfileUpdate, username: str = Depends(verify_token), db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.username == username).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    if data.full_name     is not None: user.full_name     = data.full_name
    if data.branch        is not None: user.branch        = data.branch
    if data.job_role      is not None: user.job_role      = data.job_role
    if data.qualification is not None: user.qualification = data.qualification
    if data.avatar        is not None: user.avatar        = data.avatar
    if data.new_username and data.new_username != username:
        if db.query(UserDB).filter(UserDB.username == data.new_username).first():
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = data.new_username
    if data.new_password:
        user.password = hash_password(data.new_password)
    db.commit()
    return {"message": "Profile updated", "username": user.username,
            "access_token": create_token({"sub": user.username})}


# =========================
# TEACHER ROUTES
# =========================

@router.get("/teachers")
def get_teachers(username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    return [{"code": t.code, "name": t.name} for t in db.query(TeacherDB).filter(TeacherDB.user_id == uid).all()]


@router.post("/teachers/bulk")
def save_teachers_bulk(teachers: List[TeacherModel], username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    db.query(TeacherDB).filter(TeacherDB.user_id == uid).delete()
    for t in teachers:
        db.add(TeacherDB(user_id=uid, code=t.code.strip().upper(), name=t.name.strip()))
    db.commit()
    return {"message": f"Saved {len(teachers)} teachers"}


@router.post("/teachers")
def add_teacher(teacher: TeacherModel, username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    existing = db.query(TeacherDB).filter(TeacherDB.user_id == uid, TeacherDB.code == teacher.code.upper()).first()
    if existing:
        existing.name = teacher.name.strip()
    else:
        db.add(TeacherDB(user_id=uid, code=teacher.code.upper(), name=teacher.name.strip()))
    db.commit()
    return {"message": "Teacher saved"}


@router.delete("/teachers/{code}")
def delete_teacher(code: str, username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    db.query(TeacherDB).filter(TeacherDB.user_id == uid, TeacherDB.code == code.upper()).delete()
    db.commit()
    return {"message": "Teacher deleted"}


# =========================
# ROOMS ROUTES
# =========================

@router.get("/rooms")
def get_rooms(username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    return [{"number": r.number, "type": r.type}
            for r in db.query(RoomDB).filter(RoomDB.user_id == uid).all()]


@router.post("/rooms/bulk")
def save_rooms_bulk(rooms: List[RoomModel], username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    db.query(RoomDB).filter(RoomDB.user_id == uid).delete()
    for r in rooms:
        db.add(RoomDB(user_id=uid, number=r.number.strip(), type=r.type.strip()))
    db.commit()
    return {"message": f"Saved {len(rooms)} rooms"}


@router.post("/rooms")
def add_room(room: RoomModel, username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    existing = db.query(RoomDB).filter(RoomDB.user_id == uid, RoomDB.number == room.number.strip()).first()
    if existing:
        existing.type = room.type
    else:
        db.add(RoomDB(user_id=uid, number=room.number.strip(), type=room.type))
    db.commit()
    return {"message": "Room saved"}


@router.delete("/rooms/{number}")
def delete_room(number: str, username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    db.query(RoomDB).filter(RoomDB.user_id == uid, RoomDB.number == number).delete()
    db.commit()
    return {"message": "Room deleted"}


# =========================
# NEW: TEACHER LOAD ROUTES
# =========================

@router.get("/teacher-loads")
def get_teacher_loads(
    username: str    = Depends(verify_token),
    db:       Session = Depends(get_db),
):
    uid  = get_user_id(username, db)
    rows = db.query(TeacherLoadDB).filter(TeacherLoadDB.user_id == uid).all()
    return [
        {
            "teacher_code":  r.teacher_code,
            "max_theory":    r.max_theory,
            "max_practical": r.max_practical,
        }
        for r in rows
    ]


@router.post("/teacher-loads/bulk")
def save_teacher_loads_bulk(
    loads:    List[TeacherLoadModel],
    username: str     = Depends(verify_token),
    db:       Session = Depends(get_db),
):
    uid = get_user_id(username, db)
    db.query(TeacherLoadDB).filter(TeacherLoadDB.user_id == uid).delete()
    for l in loads:
        # Only persist rows that actually have a limit set
        if l.max_theory is not None or l.max_practical is not None:
            db.add(TeacherLoadDB(
                user_id       = uid,
                teacher_code  = l.teacher_code.strip().upper(),
                max_theory    = l.max_theory,
                max_practical = l.max_practical,
            ))
    db.commit()
    return {"message": f"Saved {len(loads)} teacher load records"}


# =========================
# NEW: PERSONAL TIMETABLE ROUTES
# =========================

@router.get("/personal-timetables")
def get_all_personal_timetables(
    username: str     = Depends(verify_token),
    db:       Session = Depends(get_db),
):
    """Return every teacher's pinned slots for the logged-in user."""
    uid  = get_user_id(username, db)
    rows = db.query(PersonalTimetableDB).filter(PersonalTimetableDB.user_id == uid).all()
    return {r.teacher_code: json.loads(r.slots_json) for r in rows}


@router.post("/personal-timetable")
def save_personal_timetable(
    data:     PersonalTimetableInput,
    username: str     = Depends(verify_token),
    db:       Session = Depends(get_db),
):
    uid  = get_user_id(username, db)
    code = data.teacher_code.strip().upper()
    row  = db.query(PersonalTimetableDB).filter(
        PersonalTimetableDB.user_id      == uid,
        PersonalTimetableDB.teacher_code == code,
    ).first()
    if row:
        row.slots_json = json.dumps(data.slots)
    else:
        db.add(PersonalTimetableDB(
            user_id      = uid,
            teacher_code = code,
            slots_json   = json.dumps(data.slots),
        ))
    db.commit()
    return {"message": "Personal timetable saved"}


@router.delete("/personal-timetable/{teacher_code}")
def delete_personal_timetable(
    teacher_code: str,
    username: str     = Depends(verify_token),
    db:       Session = Depends(get_db),
):
    uid = get_user_id(username, db)
    db.query(PersonalTimetableDB).filter(
        PersonalTimetableDB.user_id      == uid,
        PersonalTimetableDB.teacher_code == teacher_code.upper(),
    ).delete()
    db.commit()
    return {"message": "Deleted"}


# =========================
# SUBJECTS ROUTES
# =========================

@router.get("/subjects")
def get_subjects(username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    return [{"name":s.name,"type":s.type,"hours":s.hours,"lab_hours":s.lab_hours,"yb_key":s.yb_key}
            for s in db.query(SubjectDB).filter(SubjectDB.user_id == uid).all()]


@router.get("/subjects/{yb_key}")
def get_subjects_for_yb(yb_key: str, username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    return [{"name":s.name,"type":s.type,"hours":s.hours,"lab_hours":s.lab_hours}
            for s in db.query(SubjectDB).filter(SubjectDB.user_id == uid, SubjectDB.yb_key == yb_key).all()]


@router.post("/subjects/bulk")
def save_subjects_bulk(data: SaveSubjectsInput, username: str = Depends(verify_token), db: Session = Depends(get_db)):
    """Save subjects for a specific year-branch, replacing existing ones for that yb_key."""
    uid = get_user_id(username, db)
    db.query(SubjectDB).filter(SubjectDB.user_id == uid, SubjectDB.yb_key == data.yb_key).delete()
    for sub in data.subjects:
        db.add(SubjectDB(
            user_id=uid, yb_key=data.yb_key,
            name=sub.name, type=sub.type, hours=sub.hours,
            lab_hours=sub.lab_hours if sub.type == "core_lab" else None,
        ))
    db.commit()
    return {"message": f"Saved {len(data.subjects)} subjects for {data.yb_key}"}


@router.delete("/subjects")
def clear_subjects(username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid = get_user_id(username, db)
    db.query(SubjectDB).filter(SubjectDB.user_id == uid).delete()
    db.commit()
    return {"message": "Subjects cleared"}


# =========================
# YEAR-BRANCH ROUTES
# =========================

@router.get("/year-branches")
def get_year_branches(username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid  = get_user_id(username, db)
    rows = db.query(YearBranchDB).filter(YearBranchDB.user_id == uid).all()
    return [{"year":r.year,"branch":r.branch,"divs":json.loads(r.divisions_json)} for r in rows]


@router.post("/year-branches/bulk")
def save_year_branches_bulk(
    year_branches: List[dict],
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Save/upsert a list of year-branch records."""
    uid = get_user_id(username, db)
    for yb in year_branches:
        year   = yb["year"].strip().upper()
        branch = yb["branch"].strip().upper()
        divs   = yb["divs"]
        existing = db.query(YearBranchDB).filter(
            YearBranchDB.user_id == uid,
            YearBranchDB.year   == year,
            YearBranchDB.branch == branch,
        ).first()
        if existing:
            existing.divisions_json = json.dumps(divs)
        else:
            db.add(YearBranchDB(user_id=uid, year=year, branch=branch, divisions_json=json.dumps(divs)))
    db.commit()
    return {"message": f"Saved {len(year_branches)} year-branches"}


# Legacy compat
@router.get("/divisions")
def get_divisions(username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid  = get_user_id(username, db)
    rows = db.query(YearBranchDB).filter(YearBranchDB.user_id == uid).all()
    divs = []
    for r in rows:
        for d in json.loads(r.divisions_json):
            divs.append({"name": f"{r.year}-{r.branch}-{d}"})
    return divs


# =========================
# TIMETABLE CONSTANTS
# =========================

DAYS              = ["Monday","Tuesday","Wednesday","Thursday","Friday"]
SLOTS             = ["9-10","10-11","11-12","12-1","1-2","2-3","3-4","4-5"]
BREAK_SLOT        = "1-2"
ALLOCATABLE_SLOTS = [s for s in SLOTS if s != BREAK_SLOT]
OUTPUT_FOLDER     = "output"
NUM_BATCHES       = 3


def get_consecutive_runs():
    runs, current = [], [0]
    for i in range(1, len(ALLOCATABLE_SLOTS)):
        p = SLOTS.index(ALLOCATABLE_SLOTS[i-1])
        c = SLOTS.index(ALLOCATABLE_SLOTS[i])
        if c - p == 1: current.append(i)
        else:          runs.append(current); current = [i]
    runs.append(current)
    return runs

CONSECUTIVE_RUNS = get_consecutive_runs()


def valid_lab_starts(lab_size: int):
    starts = []
    for run in CONSECUTIVE_RUNS:
        for i in range(len(run) - lab_size + 1):
            starts.append(run[i])
    return starts


def get_batches(div: str) -> list:
    return [f"{div}{i+1}" for i in range(NUM_BATCHES)]


def empty_cell(): return {"subject":"","teacher_code":"","room":"","batches":None}
def break_cell(): return {"subject":"BREAK","teacher_code":"","room":"","batches":None}

def empty_chromosome():
    ch = {}
    for day in DAYS:
        ch[day] = {}
        for slot in SLOTS:
            ch[day][slot] = break_cell() if slot == BREAK_SLOT else empty_cell()
    return ch


# =========================
# GENETIC ALGORITHM
# =========================

GA_POPULATION   = 30
GA_GENERATIONS  = 80
GA_TOURNAMENT_K = 4
GA_CROSSOVER_P  = 0.80
GA_MUTATION_P   = 0.15
GA_ELITE        = 2


def _place_lab(ch, day, name, lab_size, batch_assigns):
    starts = valid_lab_starts(lab_size)
    random.shuffle(starts)
    for si in starts:
        cands = ALLOCATABLE_SLOTS[si: si + lab_size]
        if all(ch[day][s]["subject"] == "" for s in cands):
            combined_tc   = ", ".join(b["teacher_code"] for b in batch_assigns if b.get("teacher_code"))
            combined_room = ", ".join(b["room"] for b in batch_assigns if b.get("room"))
            for s in cands:
                ch[day][s] = {
                    "subject":      f"{name} LAB",
                    "teacher_code": combined_tc,
                    "room":         combined_room,
                    "batches":      copy.deepcopy(batch_assigns),
                }
            return True
    return False


def random_chromosome(subjects: list, teacher_assignments: dict) -> dict:
    ch          = empty_chromosome()
    sorted_subs = sorted(subjects, key=lambda s: 0 if s["type"] == "core_lab" else 1)

    for sub in sorted_subs:
        name     = sub["name"]
        hours    = sub["hours"]
        sub_type = sub["type"]
        lab_size = sub.get("lab_hours") or 2
        assign   = teacher_assignments.get(name, {})

        if sub_type == "core_lab":
            batch_assigns = assign.get("batch_assigns") or [
                {"batch": b, "teacher_code": "", "room": ""}
                for b in get_batches("?")
            ]
            days_order = DAYS.copy(); random.shuffle(days_order)
            placed = 0
            for day in days_order:
                if placed >= hours: break
                if _place_lab(ch, day, name, lab_size, batch_assigns): placed += 1
            att = 0
            while placed < hours and att < 200:
                att += 1
                day = random.choice(DAYS)
                if _place_lab(ch, day, name, lab_size, batch_assigns): placed += 1
        else:
            t_code     = assign.get("teacher_code", "")
            room       = assign.get("room", "")
            days_order = DAYS.copy(); random.shuffle(days_order)
            rem        = hours
            passes     = math.ceil(hours / len(DAYS))
            for _ in range(passes):
                if rem == 0: break
                for day in days_order:
                    if rem == 0: break
                    free = [s for s in ALLOCATABLE_SLOTS if ch[day][s]["subject"] == ""]
                    if free:
                        ch[day][random.choice(free)] = {
                            "subject":name,"teacher_code":t_code,"room":room,"batches":None
                        }
                        rem -= 1
            att = 0
            while rem > 0 and att < 300:
                att += 1
                day  = random.choice(DAYS)
                slot = random.choice(ALLOCATABLE_SLOTS)
                if ch[day][slot]["subject"] == "":
                    ch[day][slot] = {"subject":name,"teacher_code":t_code,"room":room,"batches":None}
                    rem -= 1
    return ch


def generate_population(subjects, teacher_assignments, size):
    return [random_chromosome(subjects, teacher_assignments) for _ in range(size)]


def fitness(chromosome: dict, subjects: list) -> float:
    score = 1000.0
    for sub in subjects:
        name     = sub["name"]
        hours    = sub["hours"]
        sub_type = sub["type"]
        lab_size = sub.get("lab_hours") or 2

        if sub_type == "core_lab":
            lab_label      = f"{name} LAB"
            sessions_found = 0
            for day in DAYS:
                day_vals = [chromosome[day][s]["subject"] for s in ALLOCATABLE_SLOTS]
                i = 0
                while i <= len(day_vals) - lab_size:
                    if all(v == lab_label for v in day_vals[i:i+lab_size]):
                        real_idx = [SLOTS.index(ALLOCATABLE_SLOTS[i+k]) for k in range(lab_size)]
                        if all(real_idx[k+1]-real_idx[k]==1 for k in range(len(real_idx)-1)):
                            sessions_found += 1
                        i += lab_size
                    else:
                        i += 1
            score -= max(0, hours - sessions_found) * 100
            for day in DAYS:
                for slot in ALLOCATABLE_SLOTS:
                    if chromosome[day][slot]["subject"] == lab_label:
                        idx     = ALLOCATABLE_SLOTS.index(slot)
                        prev_ok = idx > 0 and chromosome[day][ALLOCATABLE_SLOTS[idx-1]]["subject"] == lab_label
                        next_ok = idx < len(ALLOCATABLE_SLOTS)-1 and chromosome[day][ALLOCATABLE_SLOTS[idx+1]]["subject"] == lab_label
                        if not prev_ok and not next_ok:
                            score -= 200
        else:
            total = sum(1 for d in DAYS for s in ALLOCATABLE_SLOTS if chromosome[d][s]["subject"] == name)
            score -= max(0, hours - total) * 100
            for day in DAYS:
                cnt = sum(1 for s in ALLOCATABLE_SLOTS if chromosome[day][s]["subject"] == name)
                if cnt > 1: score -= (cnt - 1) * 50

    for day in DAYS:
        day_vals = [chromosome[day][s]["subject"] for s in ALLOCATABLE_SLOTS]
        filled   = [i for i, v in enumerate(day_vals) if v != ""]
        if len(filled) >= 2:
            score -= sum(1 for i in range(filled[0], filled[-1]+1) if day_vals[i] == "") * 20

    return score


def tournament_select(population, scores, k):
    c    = random.sample(range(len(population)), k)
    best = max(c, key=lambda i: scores[i])
    return copy.deepcopy(population[best])


def crossover(pa, pb):
    if random.random() > GA_CROSSOVER_P: return copy.deepcopy(pa)
    child = empty_chromosome()
    for day in DAYS:
        donor = pa if random.random() < 0.5 else pb
        for slot in SLOTS:
            child[day][slot] = copy.deepcopy(donor[day][slot])
    return child


def mutate(chromosome, subjects, teacher_assignments):
    ch   = copy.deepcopy(chromosome)
    need = {}
    for sub in subjects:
        name     = sub["name"]
        sub_type = sub["type"]
        if sub_type == "core_lab":
            lab_label  = f"{name} LAB"
            current    = sum(1 for d in DAYS for s in ALLOCATABLE_SLOTS if ch[d][s]["subject"] == lab_label)
            need[name] = max(0, sub["hours"] * (sub.get("lab_hours") or 2) - current)
        else:
            current    = sum(1 for d in DAYS for s in ALLOCATABLE_SLOTS if ch[d][s]["subject"] == name)
            need[name] = max(0, sub["hours"] - current)

    needy = [n for n, v in need.items() if v > 0]

    for day in DAYS:
        for slot in ALLOCATABLE_SLOTS:
            if random.random() < GA_MUTATION_P:
                ch[day][slot] = empty_cell()
                if needy:
                    subj    = random.choice(needy)
                    sub_obj = next((s for s in subjects if s["name"] == subj), None)
                    assign  = teacher_assignments.get(subj, {})
                    if sub_obj and sub_obj["type"] == "core_lab":
                        ba = assign.get("batch_assigns") or []
                        _place_lab(ch, day, subj, sub_obj.get("lab_hours") or 2, ba)
                    else:
                        ch[day][slot] = {
                            "subject":      subj,
                            "teacher_code": assign.get("teacher_code",""),
                            "room":         assign.get("room",""),
                            "batches":      None,
                        }
    return ch


def ga_generate_timetable(subjects: list, teacher_assignments: dict) -> dict:
    population      = generate_population(subjects, teacher_assignments, GA_POPULATION)
    best_chromosome = None
    best_score      = -999999

    for _ in range(GA_GENERATIONS):
        scores       = [fitness(ch, subjects) for ch in population]
        gen_best_idx = max(range(len(scores)), key=lambda i: scores[i])
        if scores[gen_best_idx] > best_score:
            best_score      = scores[gen_best_idx]
            best_chromosome = copy.deepcopy(population[gen_best_idx])
        if best_score >= 1000: break

        sorted_idx     = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        new_population = [copy.deepcopy(population[i]) for i in sorted_idx[:GA_ELITE]]
        while len(new_population) < GA_POPULATION:
            pa    = tournament_select(population, scores, GA_TOURNAMENT_K)
            pb    = tournament_select(population, scores, GA_TOURNAMENT_K)
            child = crossover(pa, pb)
            child = mutate(child, subjects, teacher_assignments)
            new_population.append(child)
        population = new_population

    return best_chromosome


# =========================
# TEACHER CONFLICT DETECTION
# =========================

def check_teacher_conflicts(all_timetables: dict) -> list:
    slot_map  = {}
    conflicts = []

    for yb_key, div_grids in all_timetables.items():
        for div, grid in div_grids.items():
            for day in DAYS:
                for slot in ALLOCATABLE_SLOTS:
                    cell = grid[day][slot]
                    if not cell or cell["subject"] == "BREAK" or not cell["subject"]:
                        continue
                    if cell.get("batches"):
                        for b in cell["batches"]:
                            tc = b.get("teacher_code","").strip()
                            if not tc: continue
                            key = (day, slot, tc)
                            slot_map.setdefault(key, []).append(
                                {"yb_key":yb_key,"div":div,"batch":b["batch"],"subject":cell["subject"]}
                            )
                    else:
                        for tc in (cell.get("teacher_code","") or "").split(","):
                            tc = tc.strip()
                            if not tc: continue
                            key = (day, slot, tc)
                            slot_map.setdefault(key, []).append(
                                {"yb_key":yb_key,"div":div,"batch":"","subject":cell["subject"]}
                            )

    for (day, slot, tc), entries in slot_map.items():
        if len(entries) > 1:
            conflicts.append({"teacher_code":tc,"day":day,"slot":slot,"classes":entries})

    return conflicts


# =========================
# HELPER: normalise frontend cell keys → backend snake_case
# =========================

def _normalise_cell(cell: dict) -> dict:
    if not cell or not isinstance(cell, dict):
        return cell
    if "teacherCode" in cell and "teacher_code" not in cell:
        cell["teacher_code"] = cell.pop("teacherCode")
    if cell.get("batches"):
        for b in cell["batches"]:
            if "teacherCode" in b and "teacher_code" not in b:
                b["teacher_code"] = b.pop("teacherCode")
    return cell


def normalise_timetable(timetable: dict) -> dict:
    for day in DAYS:
        for slot in SLOTS:
            if day in timetable and slot in timetable[day]:
                timetable[day][slot] = _normalise_cell(timetable[day][slot])
    return timetable


# =========================
# GENERATE ENDPOINT
# =========================

@router.post("/generate")
def generate_timetable(
    data:     GenerateInput,
    username: str     = Depends(verify_token),
    db:       Session = Depends(get_db),
):
    uid    = get_user_id(username, db)
    yb_key = f"{data.year.strip().upper()}-{data.branch.strip().upper()}"

    # Save subjects (per yb_key)
    db.query(SubjectDB).filter(SubjectDB.user_id == uid, SubjectDB.yb_key == yb_key).delete()
    for sub in data.subjects:
        db.add(SubjectDB(
            user_id=uid, yb_key=yb_key, name=sub.name, type=sub.type, hours=sub.hours,
            lab_hours=sub.lab_hours if sub.type == "core_lab" else None,
        ))

    # Save / update YearBranch
    existing_yb = db.query(YearBranchDB).filter(
        YearBranchDB.user_id == uid,
        YearBranchDB.year   == data.year.upper(),
        YearBranchDB.branch == data.branch.upper(),
    ).first()
    if existing_yb:
        existing_yb.divisions_json = json.dumps(data.divisions)
    else:
        db.add(YearBranchDB(
            user_id=uid, year=data.year.upper(), branch=data.branch.upper(),
            divisions_json=json.dumps(data.divisions),
        ))

    # Save assignments
    db.query(AssignmentDB).filter(
        AssignmentDB.user_id == uid, AssignmentDB.yb_key == yb_key
    ).delete()

    for div, sub_map in (data.teacher_assignments or {}).items():
        for sub_name, assign_val in sub_map.items():
            if isinstance(assign_val, dict):
                t_code        = assign_val.get("teacher_code","")
                room          = assign_val.get("room","")
                batch_assigns = assign_val.get("batch_assigns") or None
            else:
                t_code = assign_val; room = ""; batch_assigns = None

            db.add(AssignmentDB(
                user_id=uid, yb_key=yb_key, division=div, subject_name=sub_name,
                teacher_code=t_code, room=room,
                batch_assigns_json=json.dumps(batch_assigns) if batch_assigns else None,
            ))

    db.commit()

    # Build timetables
    subjects_dicts = [s.model_dump() for s in data.subjects]

    if data.timetables:
        timetables = {
            div: normalise_timetable(grid)
            for div, grid in data.timetables.items()
        }
    else:
        timetables = {}
        for div in data.divisions:
            div_assign = {}
            for sub_name, assign_val in (data.teacher_assignments or {}).get(div, {}).items():
                if isinstance(assign_val, dict):
                    div_assign[sub_name] = {
                        "teacher_code":  assign_val.get("teacher_code",""),
                        "room":          assign_val.get("room",""),
                        "batch_assigns": assign_val.get("batch_assigns") or [],
                    }
                else:
                    div_assign[sub_name] = {"teacher_code":assign_val,"room":"","batch_assigns":[]}
            timetables[div] = ga_generate_timetable(subjects_dicts, div_assign)

    # Conflict check
    conflicts = check_teacher_conflicts({yb_key: timetables})

    # Persist timetable
    existing_tt = db.query(TimetableDB).filter(
        TimetableDB.user_id == uid, TimetableDB.yb_key == yb_key
    ).first()
    if existing_tt:
        existing_tt.data_json = json.dumps(timetables)
    else:
        db.add(TimetableDB(user_id=uid, yb_key=yb_key, data_json=json.dumps(timetables)))
    db.commit()

    file = export_excel({yb_key: timetables})

    return {
        "message":           "Timetable Generated Successfully",
        "generated_by":      username,
        "year_branch":       yb_key,
        "divisions":         data.divisions,
        "file":              file,
        "teacher_conflicts": conflicts,
        "conflict_count":    len(conflicts),
    }


# =========================
# TIMETABLE GET ROUTES
# =========================

@router.get("/timetable/{yb_key}")
def get_timetable(yb_key: str, username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid    = get_user_id(username, db)
    record = db.query(TimetableDB).filter(TimetableDB.user_id == uid, TimetableDB.yb_key == yb_key).first()
    if not record: return {"timetables": {}}
    return {"yb_key": yb_key, "timetables": json.loads(record.data_json)}


@router.get("/timetables")
def get_all_timetables(username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid     = get_user_id(username, db)
    records = db.query(TimetableDB).filter(TimetableDB.user_id == uid).all()
    return {r.yb_key: json.loads(r.data_json) for r in records}


@router.get("/teacher-timetable/{teacher_code}")
def get_teacher_timetable(
    teacher_code: str,
    username: str  = Depends(verify_token),
    db: Session    = Depends(get_db),
):
    uid     = get_user_id(username, db)
    records = db.query(TimetableDB).filter(TimetableDB.user_id == uid).all()

    teacher_grid = {day: {slot: [] for slot in SLOTS} for day in DAYS}

    for record in records:
        yb_key  = record.yb_key
        div_tt  = json.loads(record.data_json)
        for div, grid in div_tt.items():
            for day in DAYS:
                for slot in ALLOCATABLE_SLOTS:
                    cell = grid.get(day, {}).get(slot, {})
                    if not cell.get("subject") or cell["subject"] == "BREAK": continue

                    if cell.get("batches"):
                        for b in cell["batches"]:
                            if b.get("teacher_code","") == teacher_code:
                                teacher_grid[day][slot].append({
                                    "subject":  cell["subject"],
                                    "yb_label": yb_key,
                                    "div":      div,
                                    "batch":    b["batch"],
                                    "room":     b.get("room",""),
                                })
                    else:
                        codes = [c.strip() for c in (cell.get("teacher_code","") or "").split(",")]
                        if teacher_code in codes:
                            teacher_grid[day][slot].append({
                                "subject":  cell["subject"],
                                "yb_label": yb_key,
                                "div":      div,
                                "batch":    "",
                                "room":     cell.get("room",""),
                            })

    return {"teacher_code": teacher_code, "timetable": teacher_grid}


@router.get("/assignments/{yb_key}")
def get_assignments(yb_key: str, username: str = Depends(verify_token), db: Session = Depends(get_db)):
    uid  = get_user_id(username, db)
    rows = db.query(AssignmentDB).filter(
        AssignmentDB.user_id == uid, AssignmentDB.yb_key == yb_key
    ).all()
    result = {}
    for a in rows:
        entry = {"teacher_code": a.teacher_code or "", "room": a.room or ""}
        if a.batch_assigns_json:
            entry["batch_assigns"] = json.loads(a.batch_assigns_json)
        result.setdefault(a.division, {})[a.subject_name] = entry
    return result


# =========================
# EXCEL EXPORT
# =========================

def export_excel(all_timetables: dict) -> str:
    if not os.path.exists(OUTPUT_FOLDER):
        os.makedirs(OUTPUT_FOLDER)

    file_path = os.path.join(OUTPUT_FOLDER, "timetable.xlsx")

    slot_labels = {
        "9-10":"9:00-10:00","10-11":"10:00-11:00","11-12":"11:00-12.00",
        "12-1":"12:00-01:00","1-2":"01:00-2:00","2-3":"2:00-3:00",
        "3-4":"3:00-4:00","4-5":"4:00-5:00",
    }
    day_short = {"Monday":"Mon","Tuesday":"Tue","Wednesday":"Wed","Thursday":"Thu","Friday":"Fri"}

    with pd.ExcelWriter(file_path, engine="openpyxl") as writer:
        for yb_key, div_grids in all_timetables.items():
            for div, grid in div_grids.items():
                sheet_name = f"{yb_key}-{div}"[:31]
                aoa = []
                for _ in range(5): aoa.append([None]*11)
                aoa.append([None, None, "Department"] + [None]*8)
                aoa.append([None, None, "Time Table"] + [None]*8)
                aoa.append([None]*10 + [f"{yb_key}-{div}"])
                aoa.append([None, None, "Day/Time"] + [slot_labels[s] for s in SLOTS])
                aoa.append([None]*11)

                for day in DAYS:
                    sub_row = [None, None, day_short[day]]
                    tc_row  = [None, None, "Faculty"]
                    rm_row  = [None, None, "Room"]
                    for slot in SLOTS:
                        cell = grid.get(day, {}).get(slot, {})
                        if slot == BREAK_SLOT:
                            sub_row.append("BREAK"); tc_row.append(None); rm_row.append(None)
                        else:
                            sub_row.append(cell.get("subject","") or "")
                            if cell.get("batches"):
                                tc_row.append(" | ".join(
                                    f"{b['batch']}:{b.get('teacher_code','—')}" for b in cell["batches"]
                                ))
                                rm_row.append(" | ".join(
                                    f"{b['batch']}:{b.get('room','—')}" for b in cell["batches"]
                                ))
                            else:
                                tc_row.append(cell.get("teacher_code","") or "")
                                rm_row.append(cell.get("room","") or "")
                    aoa.append(sub_row)
                    aoa.append(tc_row)
                    aoa.append(rm_row)
                    aoa.append([None]*11)
                import pandas as pd
                df = pd.DataFrame(aoa)
                df.to_excel(writer, sheet_name=sheet_name, index=False, header=False)

    return file_path


# =========================
# INCLUDE ROUTER
# =========================

app.include_router(router)


from fastapi import Header

# THIS IS YOUR MASTER KEY.
# You must type this EXACTLY into the HTML input box.
ADMIN_SECRET_TOKEN = "backend_dev_2026_access"

@router.get("/admin", response_class=HTMLResponse)
def admin_panel(request: Request):
    return templates.TemplateResponse("admin.html", {"request": request, "title": "Admin Panel"})

@router.get("/admin/db-explorer")
def admin_db_explorer(x_admin_token: str = Header(None), db: Session = Depends(get_db)):
    if x_admin_token != ADMIN_SECRET_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid Admin Token")

    timetables = db.query(TimetableDB).all()
    users = db.query(UserDB).all()

    return {
        "timetables": [
            {
                "id": t.id,
                "yb_key": t.yb_key,
                "user_id": t.user_id,
                "data": json.loads(t.data_json)
            } for t in timetables
        ],
        "users": [{"id": u.id, "username": u.username} for u in users]
    }

@router.delete("/admin/delete-timetable/{tt_id}")
def admin_delete_timetable(tt_id: int, x_admin_token: str = Header(None), db: Session = Depends(get_db)):
    if x_admin_token != ADMIN_SECRET_TOKEN:
        raise HTTPException(status_code=403, detail="Unauthorized")

    record = db.query(TimetableDB).filter(TimetableDB.id == tt_id).first()
    if record:
        db.delete(record)
        db.commit()
        return {"message": "Deleted"}
    raise HTTPException(status_code=404, detail="Not found")


@app.get("/")
def home():
    return {"message": "AI Timetable Generator — Multi-Year · Multi-Branch · Lab Batches · Teacher-Aware"}