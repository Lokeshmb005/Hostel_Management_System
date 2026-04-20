/* ═══════════════════════════════════════════
   FIREBASE  (keys loaded from config.js)
═══════════════════════════════════════════ */
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.firestore();


/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
var currentUser   = null;
var wardenProfile = null;
var allStudents   = [];   // loaded once, reused everywhere
var attMap        = {};   // { uid: 'present'|'absent' }
var currentGPTab  = 'pending';

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function toast(msg, type) {
  type = type || 'info';
  var icons = { info:'ℹ️', success:'✅', error:'❌', warning:'⚠️' };
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span class="toast-icon">' + (icons[type]||'ℹ️') + '</span><span>' + msg + '</span>';
  document.getElementById('toast-container').appendChild(el);
  setTimeout(function(){ el.remove(); }, 4000);
}

/* ═══════════════════════════════════════════
   AUTH GUARD
═══════════════════════════════════════════ */
auth.onAuthStateChanged(function(user) {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  loadWardenProfile();
});

function loadWardenProfile() {
  db.collection('users').doc(currentUser.uid).get().then(function(doc) {
    if (!doc.exists) { logout(); return; }
    if (doc.data().role !== 'warden') { window.location.href = 'student.html'; return; }
    wardenProfile = Object.assign({ uid: currentUser.uid }, doc.data());
    renderWardenInfo();
    loadAllStudents().then(function() {
      loadOverview();
      document.getElementById('loader').classList.add('hidden');
    });
  }).catch(function(err) {
    toast('Profile load error: ' + err.message, 'error');
    document.getElementById('loader').classList.add('hidden');
  });
}

function renderWardenInfo() {
  var initials = (wardenProfile.name||'W').split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().slice(0,2);
  var sidebarAv = document.getElementById('wardenAvatar');
  if (wardenProfile.photoURL) {
    sidebarAv.innerHTML = '<img src="' + wardenProfile.photoURL + '" alt="avatar">';
  } else {
    sidebarAv.textContent = initials;
  }
  document.getElementById('wardenName').textContent    = wardenProfile.name || 'Warden';
  document.getElementById('wardenMeta').textContent    = 'Staff ID: ' + (wardenProfile.staffid||'—') + ' • Floor ' + (wardenProfile.floor||'—');
  document.getElementById('wardenSubtitle').textContent = 'Floor: ' + (wardenProfile.floor||'—') + ' • Staff ID: ' + (wardenProfile.staffid||'—');
}

/* ═══════════════════════════════════════════
   LOAD ALL STUDENTS — returns Promise
═══════════════════════════════════════════ */
function loadAllStudents() {
  return db.collection('users').where('role', '==', 'student').get().then(function(snap) {
    allStudents = snap.docs.map(function(d) { return Object.assign({ uid: d.id }, d.data()); });
    // Sort by room number
    allStudents.sort(function(a,b){ return (a.room||'').localeCompare(b.room||''); });
    renderStudentsTable(allStudents);
  }).catch(function(err) {
    toast('Could not load students: ' + err.message, 'error');
  });
}

/* ═══════════════════════════════════════════
   OVERVIEW — runs AFTER allStudents is ready
═══════════════════════════════════════════ */
function loadOverview() {
  var today = todayKey();
  document.getElementById('todayDate').textContent =
    new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Stats: total + present/absent from today's attendance
  document.getElementById('st-total').textContent = allStudents.length;
  var pres = 0, abs = 0;
  var attPromises = allStudents.map(function(s) {
    return db.collection('attendance').doc(s.uid).collection('records').doc(today).get()
      .then(function(r) {
        if (r.exists) { if (r.data().status === 'present') pres++; else abs++; }
      }).catch(function(){});
  });
  Promise.all(attPromises).then(function() {
    document.getElementById('st-present').textContent = pres;
    document.getElementById('st-absent').textContent  = abs;
  });

  // Pending gatepasses
  db.collection('gatepasses').where('status','==','pending').get().then(function(snap) {
    document.getElementById('st-pending').textContent = snap.size;
    var badge = document.getElementById('pendingBadge');
    if (snap.size > 0) { badge.textContent = snap.size; badge.style.display = 'inline'; }
    else               { badge.style.display = 'none'; }
    renderOverviewPending(snap.docs);
  });

  // Floor quick view (allStudents already loaded)
  renderFloorRows('floorQuickBody', false);
}

/* ═══════════════════════════════════════════
   TAB NAVIGATION
═══════════════════════════════════════════ */
function showTab(name) {
  document.querySelectorAll('.tab-pane').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(i){ i.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');

  if (name === 'attendance') {
    var d = document.getElementById('attDate');
    if (!d.value) { d.value = todayKey(); }
    loadStudentsForAtt();
  }
  if (name === 'gatepasses')  loadGatepasses();
  if (name === 'floorstatus') renderFloorStatus();
  if (name === 'profile')     renderWardenProfile();
  closeSidebar();
}

/* ═══════════════════════════════════════════
   RENDER WARDEN PROFILE
═══════════════════════════════════════════ */
function renderWardenProfile() {
  var p = wardenProfile;
  if (!p) return;
  var initials = (p.name||'W').split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().slice(0,2);

  var avatarEl = document.getElementById('wprofAvatar');
  if (p.photoURL) {
    avatarEl.innerHTML = '<img src="' + p.photoURL + '" alt="avatar">';
  } else {
    avatarEl.textContent = initials;
  }

  document.getElementById('wprofName').textContent      = p.name    || '—';
  document.getElementById('wprofStaffid').textContent   = p.staffid || '—';
  document.getElementById('wprofFloor').textContent     = p.floor   ? 'Floor ' + p.floor : '—';
  document.getElementById('wprofEmail').textContent     = p.email   || currentUser.email || '—';
  document.getElementById('wprofMobile').textContent    = p.mobile  || '—';
  document.getElementById('wprofStudentCount').textContent = allStudents.length ? allStudents.length + ' students' : '—';
}

/* ═══════════════════════════════════════════
   MARK ATTENDANCE
═══════════════════════════════════════════ */
function loadStudentsForAtt() {
  var dateVal = document.getElementById('attDate').value;
  if (!dateVal) { toast('Please select a date.', 'warning'); return; }

  var tbody = document.getElementById('attTableBody');
  attMap = {};

  if (!allStudents.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted);">No students registered yet.</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted);">Loading attendance data...</td></tr>';

  // Load existing marks for that date
  var promises = allStudents.map(function(s) {
    return db.collection('attendance').doc(s.uid).collection('records').doc(dateVal).get()
      .then(function(r) { attMap[s.uid] = r.exists ? r.data().status : 'present'; })
      .catch(function()  { attMap[s.uid] = 'present'; });
  });

  Promise.all(promises).then(function() {
    tbody.innerHTML = allStudents.map(function(s) {
      return '<tr>' +
        '<td>' + (s.room||'—') + '</td>' +
        '<td><div class="att-row-name">' + (s.name||'Unknown') + '</div>' +
            '<div class="att-row-meta">' + (s.email||'') + '</div></td>' +
        '<td>' + (s.regno||'—') + '</td>' +
        '<td><div class="att-toggle" id="toggle-' + s.uid + '">' +
          '<button class="att-toggle-btn ' + (attMap[s.uid]==='present'?'present-active':'') + '" ' +
            'onclick="setAtt(\'' + s.uid + '\',\'present\')">Present</button>' +
          '<button class="att-toggle-btn ' + (attMap[s.uid]==='absent'?'absent-active':'') + '" ' +
            'onclick="setAtt(\'' + s.uid + '\',\'absent\')">Absent</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  });
}

function setAtt(uid, status) {
  attMap[uid] = status;
  var tgl = document.getElementById('toggle-' + uid);
  if (!tgl) return;
  tgl.querySelector('.att-toggle-btn:first-child').className = 'att-toggle-btn ' + (status === 'present' ? 'present-active' : '');
  tgl.querySelector('.att-toggle-btn:last-child').className  = 'att-toggle-btn ' + (status === 'absent'  ? 'absent-active'  : '');
}

function markAll(status) {
  allStudents.forEach(function(s) { setAtt(s.uid, status); });
}

function submitAttendance() {
  var dateVal = document.getElementById('attDate').value;
  if (!dateVal)           { toast('Please select a date.', 'warning'); return; }
  if (!allStudents.length){ toast('No students found.', 'warning'); return; }

  var btn = document.getElementById('submitAttBtn');
  btn.classList.add('loading');
  btn.textContent = 'Saving...';

  var batch = db.batch();
  allStudents.forEach(function(s) {
    var ref = db.collection('attendance').doc(s.uid).collection('records').doc(dateVal);
    batch.set(ref, {
      status:   attMap[s.uid] || 'present',
      markedBy: currentUser.uid,
      markedAt: firebase.firestore.FieldValue.serverTimestamp(),
      date:     dateVal,
    });
  });

  batch.commit().then(function() {
    btn.classList.remove('loading');
    btn.textContent = '💾 Save Attendance';
    toast('Attendance saved for ' + dateVal + '!', 'success');
    loadOverview(); // refresh stats
  }).catch(function(err) {
    btn.classList.remove('loading');
    btn.textContent = '💾 Save Attendance';
    toast('Save failed: ' + err.message, 'error');
  });
}

/* ═══════════════════════════════════════════
   GATEPASSES
   — NO orderBy (avoids composite index), sort client-side
═══════════════════════════════════════════ */
function switchGPTab(status) {
  currentGPTab = status;
  document.querySelectorAll('[id^="gp-tab-"]').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('gp-tab-' + status).classList.add('active');
  loadGatepasses();
}

function loadGatepasses() {
  var tbody = document.getElementById('gpTableBody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">Loading...</td></tr>';

  db.collection('gatepasses').where('status', '==', currentGPTab).get()
    .then(function(snap) {
      if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-muted);">No ' + currentGPTab + ' requests.</td></tr>';
        return;
      }
      // Sort by timestamp descending client-side
      var sorted = snap.docs.slice().sort(function(a,b) {
        var aT = a.data().timestamp; var bT = b.data().timestamp;
        if (!aT) return 1; if (!bT) return -1;
        return bT.seconds - aT.seconds;
      });
      tbody.innerHTML = sorted.map(function(doc) { return gpRow(doc); }).join('');
    })
    .catch(function(err) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:2rem;">' + err.message + '</td></tr>';
    });
}

function gpRow(doc) {
  var d = doc.data();
  var fmtDT = function(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  };
  var actionBtn = currentGPTab === 'pending'
    ? '<div class="actions-cell">' +
        '<button class="btn btn-success btn-sm" onclick="updateGatepass(\'' + doc.id + '\',\'approved\')">✅ Approve</button>' +
        '<button class="btn btn-danger btn-sm"  onclick="updateGatepass(\'' + doc.id + '\',\'rejected\')">❌ Reject</button>' +
      '</div>'
    : '<span class="badge badge-' + currentGPTab + '" style="font-size:0.72rem;">' +
        currentGPTab.charAt(0).toUpperCase() + currentGPTab.slice(1) + '</span>';

  return '<tr>' +
    '<td><div class="att-row-name">' + (d.studentName||'—') + '</div></td>' +
    '<td>' + (d.regno||'—') + '<br><span style="font-size:0.78rem;color:var(--text-muted)">Room ' + (d.room||'—') + '</span></td>' +
    '<td>' + (d.leaveType||'—') + '</td>' +
    '<td>' + fmtDT(d.outDate) + '</td>' +
    '<td>' + fmtDT(d.inDate) + '</td>' +
    '<td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (d.reason||'—') + '</td>' +
    '<td>' + actionBtn + '</td>' +
  '</tr>';
}

function renderOverviewPending(docs) {
  var el = document.getElementById('overviewPendingList');
  if (!docs.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No pending requests. All clear!</p></div>';
    return;
  }
  var fmtDT = function(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  };
  el.innerHTML = '<div class="table-wrap"><table>' +
    '<thead><tr><th>Student</th><th>Reg / Room</th><th>Type</th><th>Departure</th><th>Actions</th></tr></thead><tbody>' +
    docs.slice(0, 5).map(function(doc) {
      var d = doc.data();
      return '<tr>' +
        '<td><div class="att-row-name">' + (d.studentName||'—') + '</div></td>' +
        '<td>' + (d.regno||'—') + ' / Room ' + (d.room||'—') + '</td>' +
        '<td>' + (d.leaveType||'—') + '</td>' +
        '<td>' + fmtDT(d.outDate) + '</td>' +
        '<td class="actions-cell">' +
          '<button class="btn btn-success btn-sm" onclick="updateGatepass(\'' + doc.id + '\',\'approved\')">✅ Approve</button>' +
          '<button class="btn btn-danger btn-sm"  onclick="updateGatepass(\'' + doc.id + '\',\'rejected\')">❌ Reject</button>' +
        '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';
}

function updateGatepass(docId, status) {
  db.collection('gatepasses').doc(docId).update({
    status:     status,
    reviewedBy: currentUser.uid,
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).then(function() {
    toast('Gatepass ' + status + '!', status === 'approved' ? 'success' : 'warning');
    loadGatepasses();   // refresh gatepass table
    loadOverview();     // refresh stats + pending count
  }).catch(function(err) { toast(err.message, 'error'); });
}

/* ═══════════════════════════════════════════
   FLOOR STATUS
═══════════════════════════════════════════ */
function renderFloorStatus() {
  document.getElementById('floorDateLabel').textContent =
    new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
  renderFloorRows('floorStatusBody', true);
}

// Core floor-row renderer used by both Overview (quick) and Floor Status tab
function renderFloorRows(tbodyId, showRemark) {
  var tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (!allStudents.length) {
    var cols = showRemark ? 5 : 4;
    tbody.innerHTML = '<tr><td colspan="' + cols + '" style="text-align:center;padding:2rem;color:var(--text-muted);">No students registered yet.</td></tr>';
    return;
  }

  var today = todayKey();

  // 1) Fetch today's attendance for each student
  var attPromises = allStudents.map(function(s) {
    return db.collection('attendance').doc(s.uid).collection('records').doc(today).get()
      .then(function(r) { return Object.assign({}, s, { attStatus: r.exists ? r.data().status : 'unknown' }); })
      .catch(function()  { return Object.assign({}, s, { attStatus: 'unknown' }); });
  });

  Promise.all(attPromises).then(function(rows) {
    // 2) Fetch active approved gatepasses
    db.collection('gatepasses').where('status', '==', 'approved').get()
      .then(function(snap) {
        var now = new Date();
        var onLeaveUids = new Set();
        snap.docs.forEach(function(doc) {
          var gp = doc.data();
          var outDt = new Date(gp.outDate);
          var inDt  = new Date(gp.inDate);
          if (now >= outDt && now <= inDt) onLeaveUids.add(gp.studentUid);
        });

        tbody.innerHTML = rows.map(function(r) {
          var onLeave = onLeaveUids.has(r.uid);
          var statusHtml = onLeave
            ? '<span class="badge badge-pending">🚶 On Leave</span>'
            : r.attStatus === 'present'
              ? '<span class="badge badge-present">● Present</span>'
              : r.attStatus === 'absent'
                ? '<span class="badge badge-absent">● Absent</span>'
                : '<span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text-muted)">— Not Marked</span>';
          var remarkCell = showRemark
            ? '<td style="font-size:0.8rem;color:var(--text-muted);">' + (onLeave ? 'Approved gatepass active' : '') + '</td>'
            : '';
          return '<tr>' +
            '<td>' + (r.room||'—') + '</td>' +
            '<td>' + (r.name||'—') + '</td>' +
            '<td>' + (r.regno||'—') + '</td>' +
            '<td>' + statusHtml + '</td>' +
            remarkCell +
          '</tr>';
        }).join('');
      })
      .catch(function() {
        // Fallback: show without leave detection
        tbody.innerHTML = rows.map(function(r) {
          var statusHtml = r.attStatus === 'present'
            ? '<span class="badge badge-present">● Present</span>'
            : r.attStatus === 'absent'
              ? '<span class="badge badge-absent">● Absent</span>'
              : '<span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text-muted)">— Not Marked</span>';
          var remarkCell = showRemark ? '<td></td>' : '';
          return '<tr><td>' + (r.room||'—') + '</td><td>' + (r.name||'—') + '</td><td>' + (r.regno||'—') + '</td><td>' + statusHtml + '</td>' + remarkCell + '</tr>';
        }).join('');
      });
  });
}

/* ═══════════════════════════════════════════
   STUDENTS TABLE
═══════════════════════════════════════════ */
function renderStudentsTable(students) {
  var tbody = document.getElementById('studentsBody');
  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted);">No students found.</td></tr>';
    return;
  }
  tbody.innerHTML = students.map(function(s) {
    return '<tr>' +
      '<td><div class="att-row-name">' + (s.name||'—') + '</div></td>' +
      '<td>' + (s.regno||'—') + '</td>' +
      '<td>' + (s.room||'—') + '</td>' +
      '<td style="color:var(--text-muted);font-size:0.85rem;">' + (s.email||'—') + '</td>' +
    '</tr>';
  }).join('');
}

function filterStudents() {
  var q = document.getElementById('studentSearch').value.toLowerCase();
  var filtered = allStudents.filter(function(s) {
    return (s.name||'').toLowerCase().includes(q) || (s.regno||'').toLowerCase().includes(q);
  });
  renderStudentsTable(filtered);
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function todayKey() {
  var n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
function logout() {
  auth.signOut().then(function() {
    localStorage.removeItem('hms_user');
    window.location.href = 'index.html';
  });
}

/* ═══════════════════════════════════════════
   EDIT PROFILE MODAL (Warden)
═══════════════════════════════════════════ */
var pendingPhotoURL = undefined;

function openEditModal() {
  var p = wardenProfile || {};
  pendingPhotoURL = undefined;

  var initials = (p.name||'W').split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().slice(0,2);
  var epAv = document.getElementById('epAvatar');
  if (p.photoURL) {
    epAv.innerHTML = '<img src="' + p.photoURL + '" alt="avatar">';
    document.getElementById('epRemoveBtn').style.display = 'inline';
  } else {
    epAv.textContent = initials;
    document.getElementById('epRemoveBtn').style.display = 'none';
  }

  document.getElementById('epEmail').value  = p.email  || currentUser.email || '';
  document.getElementById('epMobile').value = p.mobile || '';
  document.getElementById('epPhotoInput').value = '';
  document.getElementById('editModal').classList.add('open');
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('editModal')) return;
  document.getElementById('editModal').classList.remove('open');
}

function handlePhotoUpload(input) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var size = 240;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      var ctx = canvas.getContext('2d');
      var min = Math.min(img.width, img.height);
      var sx = (img.width - min) / 2;
      var sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      pendingPhotoURL = canvas.toDataURL('image/jpeg', 0.82);
      var epAv = document.getElementById('epAvatar');
      epAv.innerHTML = '<img src="' + pendingPhotoURL + '" alt="avatar">';
      document.getElementById('epRemoveBtn').style.display = 'inline';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}

function removePhoto() {
  pendingPhotoURL = null;
  var p   = wardenProfile || {};
  var ini = (p.name||'W').split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().slice(0,2);
  document.getElementById('epAvatar').textContent = ini;
  document.getElementById('epRemoveBtn').style.display = 'none';
  document.getElementById('epPhotoInput').value = '';
}

function saveProfile() {
  var email  = document.getElementById('epEmail').value.trim();
  var mobile = document.getElementById('epMobile').value.trim();
  var btn    = document.getElementById('epSaveBtn');

  if (!email) { toast('Email address cannot be empty.', 'warning'); return; }

  btn.disabled = true;
  btn.textContent = 'Saving...';

  var updates = { email: email, mobile: mobile };
  if (pendingPhotoURL !== undefined) {
    updates.photoURL = pendingPhotoURL || firebase.firestore.FieldValue.delete();
  }

  db.collection('users').doc(currentUser.uid).update(updates).then(function() {
    var authUpdate = (email !== currentUser.email)
      ? currentUser.updateEmail(email).catch(function(err) {
          if (err.code === 'auth/requires-recent-login') {
            toast('Email saved. Re-login to sync your auth email.', 'info');
          }
        })
      : Promise.resolve();
    return authUpdate;
  }).then(function() {
    Object.assign(wardenProfile, updates);
    if (pendingPhotoURL === null) delete wardenProfile.photoURL;
    else if (pendingPhotoURL) wardenProfile.photoURL = pendingPhotoURL;

    localStorage.setItem('hms_user', JSON.stringify(wardenProfile));
    renderWardenInfo();
    renderWardenProfile();
    document.getElementById('editModal').classList.remove('open');
    btn.disabled = false;
    btn.textContent = '💾 Save Changes';
    toast('Profile updated successfully!', 'success');
  }).catch(function(err) {
    btn.disabled = false;
    btn.textContent = '💾 Save Changes';
    toast('Save failed: ' + err.message, 'error');
  });
}
