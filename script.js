// script.js — VERSI FIX 100% (copy paste ini ganti yang lama)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase, ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCGyH-yVAgQU4iJ1tIz3cpWiWa65BdMsJ8",
  authDomain: "inventariskomputer.firebaseapp.com",
  databaseURL: "https://inventariskomputer-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "inventariskomputer",
  storageBucket: "inventariskomputer.firebasestorage.app",
  messagingSenderId: "915927761008",
  appId: "1:915927761008:web:a4b2e71159d00501fdf4b5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let role = 'staff';
let editingKey = null;

// === CEK LOGIN DI SEMUA HALAMAN ===
onAuthStateChanged(auth, (user) => {
  const path = location.pathname.toLowerCase();

  if (user) {
    // Sudah login
    if (path.includes('login.html') || path.includes('register.html') || path === '/' || path.includes('index.html')) {
      location.href = "dashboard.html";
    }
  } else {
    // Belum login
    if (path.includes('dashboard.html')) {
      location.href = "login.html";
    }
    if (path === '/' || path.includes('index.html')) {
      location.href = "login.html";
    }
  }
});

// === LOGIN & REGISTER ===
window.login = async () => {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged akan otomatis redirect
  } catch (e) {
    document.getElementById('msg') ? document.getElementById('msg').innerText = "Login gagal: " + e.message : alert(e.message);
  }
};

window.register = async () => {
  const nama = document.getElementById('nama').value;
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await set(ref(db, 'users/' + cred.user.uid), {
      nama, email, role: 'staff', createdAt: new Date().toISOString()
    });
    alert("Register berhasil! Silakan login.");
    location.href = "login.html";
  } catch (e) {
    document.getElementById('msg') ? document.getElementById('msg').innerText = e.message : alert(e.message);
  }
};

window.logout = async () => {
  await signOut(auth);
  location.href = "login.html";
};

// === DASHBOARD ONLY (hanya jalan di dashboard.html) ===
if (location.pathname.toLowerCase().includes('dashboard.html')) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return location.href = "login.html";

    // Ambil role
    const snap = await get(ref(db, 'users/' + user.uid));
    if (snap.exists()) {
      const data = snap.val();
      role = data.role || 'staff';
      document.getElementById('userInfo').innerText = `${data.nama} (${role.toUpperCase()})`;

      if (role === 'admin') {
        document.getElementById('adminOnly').style.display = 'block';
        document.getElementById('aksiHeader').style.display = 'table-cell';
      }
    }

    // Load inventaris
    onValue(ref(db, 'inventaris'), (snap) => {
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = '';
      if (!snap.exists()) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Belum ada data inventaris</td></tr>';
        return;
      }
      snap.forEach(child => {
        const item = child.val();
        const key = child.key;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.kode || ''}</td>
          <td>${item.merk || ''}</td>
          <td>${item.tipe || ''}</td>
          <td>${item.lokasi || ''}</td>
          <td><span class="status-${(item.status || '').toLowerCase()}">${item.status || ''}</span></td>
          <td style="display:${role==='admin'?'table-cell':'none'}">
            <button class="btn-edit" onclick="editItem('${key}',${JSON.stringify(item).replace(/'/g, "\\'")})">Edit</button>
            <button class="btn-delete" onclick="deleteItem('${key}')">Hapus</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    });
  });
}

// === CRUD ===
window.showForm = () => { if (role !== 'admin') return alert('Hanya admin!'); editingKey = null; document.getElementById('formTitle').innerText = "Tambah Komputer"; document.getElementById('formInput').style.display = 'block'; document.getElementById('status').value = 'Baik'; };
window.editItem = (key, item) => { editingKey = key; document.getElementById('formTitle').innerText = "Edit Komputer"; document.getElementById('formInput').style.display = 'block'; document.getElementById('kode').value = item.kode; document.getElementById('merk').value = item.merk; document.getElementById('tipe').value = item.tipe; document.getElementById('lokasi').value = item.lokasi; document.getElementById('status').value = item.status; };
window.cancelForm = () => { editingKey = null; document.getElementById('formInput').style.display = 'none'; };
window.saveData = async () => { if (role !== 'admin') return; const data = {kode:document.getElementById('kode').value, merk:document.getElementById('merk').value, tipe:document.getElementById('tipe').value, lokasi:document.getElementById('lokasi').value, status:document.getElementById('status').value}; const key = editingKey || Date.now().toString(); await set(ref(db, 'inventaris/' + key), data); cancelForm(); };
window.deleteItem = async (key) => { if (role !== 'admin') return; if (confirm('Yakin hapus?')) await remove(ref(db, 'inventaris/' + key)); };
