import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";

const API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";

function ThreeBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth;
    const H = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
    camera.position.set(0, 0, 8);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0x8899ff, 1.2);
    dir1.position.set(5, 5, 5);
    scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xff88cc, 0.8);
    dir2.position.set(-5, -3, 3);
    scene.add(dir2);

    const labels = ["AI", "ML", "Cloud", "Cyber", "Security", "Data", "Mining"];

    const makeLabel = (text) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 60px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 128, 128);

      return new THREE.CanvasTexture(canvas);
    };

    const cubes = [];

    labels.forEach((label, i) => {
      const geo = new THREE.BoxGeometry(1, 1, 1);

      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(`hsl(${200 + i * 15},60%,60%)`),
        transparent: true,
        opacity: 0.7,
        roughness: 0.2,
        metalness: 0.2,
        transmission: 0.3
      });

      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.set(
        3 + Math.random() * 4,
        Math.random() * 3 - 1.5,
        Math.random() * 2 - 1
      );

      const labelTex = makeLabel(label);

      const labelMat = new THREE.MeshBasicMaterial({
        map: labelTex,
        transparent: true
      });

      const labelGeo = new THREE.PlaneGeometry(0.8, 0.8);
      const labelMesh = new THREE.Mesh(labelGeo, labelMat);

      labelMesh.position.set(0, 0, 0.51);
      mesh.add(labelMesh);

      scene.add(mesh);

      cubes.push(mesh);
    });

    const animate = () => {
      requestAnimationFrame(animate);

      cubes.forEach((cube, i) => {
        cube.rotation.x += 0.003 + i * 0.0005;
        cube.rotation.y += 0.004 + i * 0.0005;
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={mountRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
  );
}

/* Glass Input Component */
function GlassInput({ label, type = "text", value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label
        style={{
          fontSize: "13px",
          color: "rgba(255,255,255,0.8)",
          fontFamily: "'DM Sans', sans-serif"
        }}
      >
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
          padding: "12px",
          borderRadius: "8px",
          border: "none",
          outline: "none",
          color: "white",
          background: focused
            ? "rgba(255,255,255,0.18)"
            : "rgba(255,255,255,0.12)",
          boxShadow: focused
            ? "0 0 0 2px rgba(150,120,255,0.6)"
            : "none",
          transition: "all .2s ease"
        }}
      />
    </div>
  );
}

export default function Login() {

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) return;

    fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (res.ok) {
          navigate("/dashboard");
        } else {
          localStorage.removeItem("token");
        }
      })
      .catch(() => {
        localStorage.removeItem("token");
      });
  }, [navigate]);

  const handleLogin = async (e) => {

    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }

    setLoading(true);

    try {

      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Login failed");
        setLoading(false);
        return;
      }

      localStorage.setItem("token", data.access_token);

      navigate("/dashboard");

    } catch (err) {

      setError("Server connection failed");

    }

    setLoading(false);
  };

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      background: "linear-gradient(135deg,#050a1a,#0d1f3c)",
      position: "relative"
    }}>

      <ThreeBackground />

      <div style={{
        marginLeft: "80px",
        width: "360px",
        padding: "40px",
        borderRadius: "18px",
        backdropFilter: "blur(24px)",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.18)",
        color: "white",
        zIndex: 10
      }}>

        <h1 style={{ marginBottom: "30px" }}>Login</h1>

        <form
          onSubmit={handleLogin}
          style={{ display: "flex", flexDirection: "column", gap: "18px" }}
        >

          <GlassInput
            label="Username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <GlassInput
            label="Password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <div style={{ color: "#ff8080", fontSize: "14px" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              background: "white",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>


          <div style={{
            textAlign: "center", fontSize: 13,
            color: "rgba(255,255,255,.45)", fontFamily: "'DM Sans',sans-serif",
          }}>
            Don't have an account?{" "}
            <span
              onClick={() => navigate("/signup")}
              style={{ color: "rgba(160,140,255,.9)", cursor: "pointer", textDecoration: "underline", fontWeight: 500 }}
            >
              Sign Up
            </span>
            </div>

        </form>

        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        input::placeholder { color: rgba(255,255,255,0.35); }
        html, body { margin: 0; padding: 0; overflow: hidden; }
      `}</style>

      </div>

    </div>
  );
}
