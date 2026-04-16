import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { API_BASE } from "../config/api";
import BrandLogo from "./BrandLogo";

function ThreeBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const width = mount.clientWidth || 1200;
    const height = mount.clientHeight || 800;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 0, 8);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const dir1 = new THREE.DirectionalLight(0x8899ff, 1.2);
    dir1.position.set(5, 5, 5);
    scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xff88cc, 0.8);
    dir2.position.set(-5, -3, 3);
    scene.add(dir2);

    const labels = ["AI", "ML", "Cloud", "Cyber", "Security", "Data", "Mining"];
    const cubes = labels.map((label, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      context.fillStyle = "rgba(255,255,255,0.9)";
      context.font = "bold 60px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, 128, 128);

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(`hsl(${200 + index * 15},60%,60%)`),
          transparent: true,
          opacity: 0.7,
          roughness: 0.2,
          metalness: 0.2,
          transmission: 0.3
        })
      );

      mesh.position.set(3 + Math.random() * 4, Math.random() * 3 - 1.5, Math.random() * 2 - 1);

      const labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.8),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
      );
      labelMesh.position.set(0, 0, 0.51);
      mesh.add(labelMesh);
      scene.add(mesh);
      return mesh;
    });

    let frameId;
    const animate = () => {
      cubes.forEach((cube, index) => {
        cube.rotation.x += 0.003 + index * 0.0005;
        cube.rotation.y += 0.004 + index * 0.0005;
      });
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    const onResize = () => {
      if (!mountRef.current) return;
      const nextWidth = mountRef.current.clientWidth || 1200;
      const nextHeight = mountRef.current.clientHeight || 800;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };

    animate();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0, zIndex: 0, width: "100%", height: "100%" }} />;
}

function GlassInput({ label, type = "text", value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", fontFamily: "'DM Sans', sans-serif" }}>{label}</label>
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
          background: focused ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)",
          boxShadow: focused ? "0 0 0 2px rgba(150,120,255,0.6)" : "none",
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
    if (localStorage.getItem("token")) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || "Invalid credentials. Please try again.");
        setLoading(false);
        return;
      }

      localStorage.setItem("token", data.access_token);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Login error:", err);
      setError("Server connection failed. Please try again later.");
    }

    setLoading(false);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "flex-start", background: "linear-gradient(135deg,#050a1a,#0d1f3c)", position: "relative" }}>
      <ThreeBackground />
      <div
        style={{
          position: "absolute",
          top: "28px",
          left: "32px",
          zIndex: 20,
          display: "flex",
          alignItems: "center",
        }}
      >
        <BrandLogo
          background="dark"
          alt="Dr. D. Y. Patil Deemed to be University logo"
          height={58}
          style={{ width: "auto", maxWidth: "min(78vw, 440px)" }}
        />
      </div>
      <div style={{ marginLeft: "80px", width: "360px", padding: "40px", borderRadius: "18px", backdropFilter: "blur(24px)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", color: "white", zIndex: 10 }}>
        <h1 style={{ marginBottom: "30px" }}>Login</h1>
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <GlassInput label="Username" placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
          <GlassInput label="Password" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <div style={{ color: "#ff8080", fontSize: "14px" }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ padding: "14px", borderRadius: "10px", border: "none", background: "white", fontWeight: "600", cursor: "pointer" }}>
            {loading ? "Logging in..." : "Login"}
          </button>
          <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.45)", fontFamily: "'DM Sans',sans-serif" }}>
            Don't have an account?{" "}
            <span onClick={() => navigate("/signup")} style={{ color: "rgba(160,140,255,.9)", cursor: "pointer", textDecoration: "underline", fontWeight: 500 }}>
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
