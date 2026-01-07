import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, push, set, update, remove, onValue, get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

// Sembunyikan halaman sampai status auth/role jelas (biar tidak terlihat kosong/flash)
document.documentElement.style.visibility = "hidden";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const el = (id) => document.getElementById(id);

// Header UI
const userInfo = el("userInfo");
const roleInfo = el("roleInfo");
const btnLogout = el("btnLogout");

// Access UI (kalau kamu masih punya card ini, akan tetap aman meski jarang terlihat karena kita redirect)
const accessCard = el("accessCard");
const myUid = el("myUid");

// Main UI
const formCard = el("formCard");
const listCard = el("listCard");
const thActions = el("thActions");

// Form
const computerForm = el("computerForm");
const editingId = el("editingId");
const assetTag = el("assetTag");
const hostname = el("hostname");
const user = el("user");
const department = el("department");
const location = el("location");
const status = el("status");
const cpu = el("cpu");
const ram = el("ram");
const storage = el("storage");
const os = el("os");
const ip = el("ip");
const notes = el("notes");
const btnSave = el("btnSave");
const btnCancel = el("btnCancel");
const formMsg = el("formMsg");

// List
const tbody = el("tbody");
const search = el("search");

let cache = [];
let canWrite = false;
let unsubscribeComputers = null;

function showPage() {
  document.documentElement.style.visibility = "visible";
}

function redirectToLogin(params = {}) {
  const url = new URL("./login.html", window.location.href);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  // replace biar tombol Back tidak balik ke halaman yang langsung redirect lagi
  window.location.replace(url.toString());
}

btnLogout?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } finally {
    redirectToLogin();
  }
});

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(ms) {
  if (!ms) return "-";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function specText(c) {
  const parts = [];
  if (c.cpu) parts.push(c.cpu);
  if (c.ram) parts.push(c.ram);
  if (c.storage) parts.push(c.storage);
  if (c.os) parts.push(c.os);
  return parts.join(" • ") || "-";
}

function clearForm() {
  editingId.value = "";
  computerForm.reset();
  status.value = "In Use";
  formMsg.textContent = "";
  btnCancel.hidden = true;
  btnSave.textContent = "Simpan";
}

function fillForm(id, c) {
  editingId.value = id;
  assetTag.value = c.assetTag ?? "";
  hostname.value = c.hostname ?? "";
  user.value = c.user ?? "";
  department.value = c.department ?? "";
  location.value = c.location ?? "";
  status.value = c.status ?? "In Use";
  cpu.value = c.cpu ?? "";
  ram.value = c.ram ?? "";
  storage.value = c.storage ?? "";
  os.value = c.os ?? "";
  ip.value = c.ip ?? "";
  notes.value = c.notes ?? "";

  btnCancel.hidden = false;
  btnSave.textContent = "Update";
  formMsg.textContent = `Mode edit: ${id}`;
}

function render(rows) {
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="muted">Belum ada data.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(({ id, ...c }) => {
    const badge = `<span class="badge">${escapeHtml(c.status || "-")}</span>`;
    const actions = canWrite
      ? `<div class="row">
           <button data-action="edit" data-id="${escapeHtml(id)}" class="secondary">Edit</button>
           <button data-action="del" data-id="${escapeHtml(id)}" class="danger">Hapus</button>
         </div>`
      : `<span class="muted">Read-only</span>`;

    return `
      <tr>
        <td><strong>${escapeHtml(c.assetTag || "-")}</strong></td>
        <td>${escapeHtml(c.hostname || "-")}</td>
        <td>${escapeHtml(c.user || "-")}</td>
        <td>${escapeHtml(c.department || "-")}</td>
        <td>${escapeHtml(c.location || "-")}</td>
        <td>${badge}</td>
        <td>${escapeHtml(specText(c))}</td>
        <td>${escapeHtml(c.ip || "-")}</td>
        <td class="muted">${escapeHtml(formatTime(c.updatedAt))}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join("");
}

function applyFilter() {
  const q = (search.value || "").trim().toLowerCase();
  if (!q) return render(cache);

  const filtered = cache.filter((c) => {
    const hay = [
      c.assetTag, c.hostname, c.user, c.department, c.location, c.status, c.ip
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  render(filtered);
}

function startComputersListener() {
  if (typeof unsubscribeComputers === "function") unsubscribeComputers();

  const computersRef = ref(db, "computers");
  unsubscribeComputers = onValue(
    computersRef,
    (snap) => {
      const val = snap.val() || {};
      const rows = Object.entries(val).map(([id, data]) => ({ id, ...data }));
      rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      cache = rows;
      applyFilter();
    },
    (err) => {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="10" class="muted">Gagal load data (cek rules/akses).</td></tr>`;
    }
  );
}

async function getRole(uid) {
  const [aSnap, sSnap] = await Promise.all([
    get(ref(db, `admins/${uid}`)),
    get(ref(db, `staff/${uid}`))
  ]);

  const isAdmin = aSnap.exists() && aSnap.val() === true;
  const isStaff = sSnap.exists() && sSnap.val() === true;

  if (isAdmin) return "admin";
  if (isStaff) return "staff";
  return "none";
}

// ===== CRUD (admin only) =====
computerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!canWrite) {
    formMsg.textContent = "Akun ini read-only.";
    return;
  }

  formMsg.textContent = "";

  const payload = {
    assetTag: assetTag.value.trim(),
    hostname: hostname.value.trim(),
    user: user.value.trim(),
    department: department.value.trim(),
    location: location.value.trim(),
    status: status.value,
    cpu: cpu.value.trim(),
    ram: ram.value.trim(),
    storage: storage.value.trim(),
    os: os.value.trim(),
    ip: ip.value.trim(),
    notes: notes.value.trim(),
    updatedAt: Date.now()
  };

  if (!payload.assetTag) {
    formMsg.textContent = "Asset Tag wajib diisi.";
    return;
  }

  try {
    const id = editingId.value.trim();
    if (id) {
      await update(ref(db, `computers/${id}`), payload);
      formMsg.textContent = "Berhasil update.";
    } else {
      const newRef = push(ref(db, "computers"));
      await set(newRef, payload);
      formMsg.textContent = "Berhasil tambah data.";
    }
    clearForm();
  } catch (e2) {
    console.error(e2);
    formMsg.textContent = `Gagal simpan: ${e2?.message || e2}`;
  }
});

btnCancel?.addEventListener("click", () => clearForm());

tbody?.addEventListener("click", async (e) => {
  if (!canWrite) return;

  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!action || !id) return;

  const item = cache.find((x) => x.id === id);
  if (!item) return;

  if (action === "edit") {
    fillForm(id, item);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (action === "del") {
    const ok = confirm(`Hapus item ${item.assetTag || id}?`);
    if (!ok) return;
    try {
      await remove(ref(db, `computers/${id}`));
      if (editingId.value === id) clearForm();
    } catch (err) {
      console.error(err);
      alert(`Gagal hapus: ${err?.message || err}`);
    }
  }
});

search?.addEventListener("input", applyFilter);

// ===== Auth gate =====
onAuthStateChanged(auth, async (u) => {
  // Reset UI
  accessCard && (accessCard.hidden = true);
  formCard && (formCard.hidden = true);
  listCard && (listCard.hidden = true);
  canWrite = false;

  if (!u) {
    if (typeof unsubscribeComputers === "function") unsubscribeComputers();
    redirectToLogin();
    return;
  }

  userInfo && (userInfo.textContent = u.email || u.uid);
  myUid && (myUid.textContent = u.uid);

  let role = "none";
  try {
    role = await getRole(u.uid);
  } catch (err) {
    console.error(err);
    role = "none";
  }

  // Jika user belum masuk admins/staff => redirect ke login page
  if (role === "none") {
    // Simpan UID agar login page bisa menampilkan UID untuk dikirim ke admin
    sessionStorage.setItem("pending_uid", u.uid);
    redirectToLogin({ reason: "noaccess" });
    return;
  }

  // Role ok, tampilkan halaman
  canWrite = role === "admin";
  roleInfo && (roleInfo.textContent = role === "admin" ? "ADMIN" : "STAFF");
  thActions && (thActions.textContent = canWrite ? "Aksi" : "Aksi (Read-only)");

  formCard && (formCard.hidden = !canWrite);
  listCard && (listCard.hidden = false);

  startComputersListener();
  showPage();
});
