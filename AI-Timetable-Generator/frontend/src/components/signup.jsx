import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";

const API_BASE = "http://localhost:8000";

function ThreeBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth, H = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
    camera.position.set(0, 0, 8);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir1 = new THREE.DirectionalLight(0x8899ff, 1.2);
    dir1.position.set(5, 5, 5);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xff88cc, 0.8);
    dir2.position.set(-5, -3, 3);
    scene.add(dir2);
    const point1 = new THREE.PointLight(0x4466ff, 2, 20);
    point1.position.set(3, 2, 4);
    scene.add(point1);

    const labels = ["AI", "ML", "Cloud", "Cyber\nSecurity", "Data\nMining", "AI", "ML", "Cloud"];

    const makeLabel = (text) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = "rgba(255,255,255,0.0)";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "bold 56px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        ctx.fillText(line, 128, 128 + (i - (lines.length - 1) / 2) * 64);
      });
      return new THREE.CanvasTexture(canvas);
    };

    const positions = [
      [3, 1.5, 0], [5, 0, -1], [4, -1.5, 0.5],
      [6, 1, -2], [5.5, -0.5, 1], [7, 0.5, -0.5],
      [3.5, -0.5, -1], [6.5, -1.5, -1.5],
    ];

    const cubes = [];
    positions.forEach((pos, i) => {
      const size = 0.7 + Math.random() * 0.4;
      const geo = new THREE.BoxGeometry(size, size, size);
      const hue = 200 + i * 20;
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(`hsl(${hue}, 60%, 65%)`),
        transparent: true,
        opacity: 0.75,
        roughness: 0.1,
        metalness: 0.2,
        transmission: 0.3,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      scene.add(mesh);

      const labelTex = makeLabel(labels[i % labels.length]);
      const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false });
      const labelGeo = new THREE.PlaneGeometry(size * 0.8, size * 0.8);
      const label = new THREE.Mesh(labelGeo, labelMat);
      label.position.set(0, 0, size / 2 + 0.01);
      mesh.add(label);

      cubes.push({ mesh, speed: 0.003 + Math.random() * 0.005 });
    });

    const nodeMat = new THREE.LineBasicMaterial({ color: 0x6688cc, transparent: true, opacity: 0.4 });
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (Math.random() > 0.5) continue;
        const pts = [new THREE.Vector3(...positions[i]), new THREE.Vector3(...positions[j])];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        scene.add(new THREE.Line(lineGeo, nodeMat));
      }
    }

    positions.forEach(pos => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xaabbff })
      );
      sphere.position.set(...pos);
      scene.add(sphere);
    });

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      cubes.forEach(({ mesh, speed }) => {
        mesh.rotation.x += speed;
        mesh.rotation.y += speed * 1.3;
      });
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />;
}

function GlassInput({ label, type = "text", value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{
        display: "block", fontSize: 13, fontWeight: 500,
        color: "rgba(255,255,255,.8)", marginBottom: 8,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "13px 16px",
          borderRadius: 10, border: "none", outline: "none",
          fontSize: 15, fontFamily: "'DM Sans', sans-serif",
          color: "#fff", boxSizing: "border-box",
          background: focused
            ? "linear-gradient(135deg, rgba(130,100,220,0.55), rgba(100,120,220,0.45))"
            : "rgba(255,255,255,0.12)",
          boxShadow: focused
            ? "0 0 0 2px rgba(150,120,255,0.65), inset 0 1px 0 rgba(255,255,255,0.1)"
            : "inset 0 1px 0 rgba(255,255,255,0.08)",
          transition: "background .2s, box-shadow .2s",
        }}
      />
    </div>
  );
}

export default function Signup() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");

    if (!username.trim() || !password.trim() || !confirm.trim()) {
      setError("Please fill in all fields."); return;
    }
    if (password !== confirm) {
      setError("Passwords do not match."); return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters."); return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Signup failed. Please try again.");
        return;
      }

      setSuccess("Account created! Redirecting to login…");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError("Cannot connect to server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: "linear-gradient(135deg, #050a1a 0%, #0a1628 60%, #0d1f3c 100%)",
      display: "flex", alignItems: "center", justifyContent: "flex-start",
      position: "relative", overflow: "hidden",
    }}>
      {/* Three.js animated background */}
      <ThreeBackground />


      {/* Glass signup card — left side */}
      <div style={{
        position: "relative", zIndex: 10,
        marginLeft: "clamp(40px, 6vw, 100px)",
        width: "clamp(300px, 90vw, 400px)",
        background: "rgba(255,255,255,0.09)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 20,
        padding: "40px 36px 44px",
        boxShadow: "0 8px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
      }}>
        <div style={{
          fontSize: 13, color: "rgba(255,255,255,.5)",
          fontFamily: "'DM Sans',sans-serif", marginBottom: 8,
        }}>
          Form
        </div>
        <h1 style={{
          fontSize: 38, fontWeight: 700, color: "#fff",
          fontFamily: "'DM Sans',sans-serif", marginBottom: 32, lineHeight: 1.1,
        }}>
          Sign Up
        </h1>

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <GlassInput
            label="Username"
            placeholder="Choose a username"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <GlassInput
            label="Password"
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <GlassInput
            label="Confirm Password"
            type="password"
            placeholder="Repeat password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />

          {error && (
            <div style={{
              fontSize: 13, color: "#ff8888", fontFamily: "'DM Sans',sans-serif",
              background: "rgba(255,60,60,0.1)", border: "1px solid rgba(255,60,60,0.3)",
              borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span>⚠</span> {error}
            </div>
          )}
          {success && (
            <div style={{
              fontSize: 13, color: "#88ffb0", fontFamily: "'DM Sans',sans-serif",
              background: "rgba(60,255,120,0.1)", border: "1px solid rgba(60,255,120,0.3)",
              borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span>✓</span> {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "14px", borderRadius: 10, border: "none",
              background: loading ? "rgba(200,200,200,0.6)" : "#fff",
              color: loading ? "#888" : "#1a1a2e",
              fontSize: 16, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)", marginTop: 4,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "transform .15s, box-shadow .15s",
            }}
            onMouseEnter={e => { if (!loading) { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 6px 24px rgba(0,0,0,0.4)"; }}}
            onMouseLeave={e => { e.target.style.transform = ""; e.target.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)"; }}
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>

          <div style={{
            textAlign: "center", fontSize: 13,
            color: "rgba(255,255,255,.45)", fontFamily: "'DM Sans',sans-serif",
          }}>
            Already have an account?{" "}
            <span
              onClick={() => navigate("/login")}
              style={{ color: "rgba(160,140,255,.9)", cursor: "pointer", textDecoration: "underline", fontWeight: 500 }}
            >
              Login
            </span>
          </div>
        </form>
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  input::placeholder { color: rgba(255,255,255,0.35); }

  /* Add these: */
  html, body { margin: 0; padding: 0; overflow: hidden; }
      `}</style>
    </div>
  );
}


