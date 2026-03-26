import React, { useState, useEffect } from "react";
import Layout from "./Layout";

export default function AdminPanel() {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAdminData = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("https://ai-timetable-generator-j7qx.onrender.com/admin/all-timetables", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setAllData(data);
    setLoading(false);
  };

  useEffect(() => { fetchAdminData(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this timetable?")) return;
    const token = localStorage.getItem("token");
    await fetch(`http://localhost:8000/admin/timetable/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchAdminData(); // Refresh list
  };

  return (
    <Layout>
      <h2>Admin Control Center</h2>
      <div className="panel">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5ff" }}>
              <th style={S.th}>ID</th>
              <th style={S.th}>User ID</th>
              <th style={S.th}>Year-Branch</th>
              <th style={S.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allData.map((item) => (
              <tr key={item.id}>
                <td style={S.td}>{item.id}</td>
                <td style={S.td}>{item.user_id}</td>
                <td style={S.td}>{item.yb_key}</td>
                <td style={S.td}>
                  <button onClick={() => handleDelete(item.id)} style={S.delBtn}>Delete</button>
                  <button style={S.editBtn}>View/Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

const S = {
  th: { padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" },
  td: { padding: "10px", borderBottom: "1px solid #eee" },
  delBtn: { background: "#ff4d4d", color: "white", border: "none", padding: "5px 10px", cursor: "pointer", borderRadius: "4px", marginRight: "5px" },
  editBtn: { background: "#4d94ff", color: "white", border: "none", padding: "5px 10px", cursor: "pointer", borderRadius: "4px" }
};