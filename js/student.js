/* ═══════════════════════════════════════════
   FIREBASE  (keys loaded from config.js)
═══════════════════════════════════════════ */
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.firestore();

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let currentUser = null;
let userProfile = null;
let calYear     = null;
let calMonth    = null;

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

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
  loadProfile();
});

function loadProfile() {
  db.collection('users').doc(currentUser.uid).get().then(function(doc) {
    if (!doc.exists) { logout(); return; }
    if (doc.data().role !== 'student') {
      window.location.href = 'warden.html'; return;
    }
    userProfile = Object.assign({ uid: currentUser.uid }, doc.data());
    renderUserInfo();
    loadDashboard();
    document.getElementById('loader').classList.add('hidden');
  }).catch(function(err) {
    toast('Failed to load profile: ' + err.message, 'error');
    document.getElementById('loader').classList.add('hidden');
  });
}

function renderUserInfo() {
  var initials = (userProfile.name || 'S').split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().slice(0,2);
  var sidebarAv = document.getElementById('userAvatar');
  if (userProfile.photoURL) {
    sidebarAv.innerHTML = '<img src="' + userProfile.photoURL + '" alt="avatar">';
  } else {
    sidebarAv.textContent = initials;
  }
  document.getElementById('userName').textContent      = userProfile.name || 'Student';
  document.getElementById('userMeta').textContent      = 'Reg: ' + (userProfile.regno||'—') + ' • Room ' + (userProfile.room||'—');
  document.getElementById('dashSubtitle').textContent  = 'Reg No: ' + (userProfile.regno||'—') + ' • Room: ' + (userProfile.room||'—');

  // Personalise greeting
  var hr = new Date().getHours();
  var greet = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
  document.getElementById('dashGreeting').textContent = greet + ', ' + (userProfile.name||'Student') + '! 👋';
}

/* ═══════════════════════════════════════════
   TAB NAVIGATION
═══════════════════════════════════════════ */
function showTab(name) {
  document.querySelectorAll('.tab-pane').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(i){ i.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'attendance') renderFullCalendar();
  if (name === 'mygatepass') loadMyGatepasses();
  if (name === 'profile')    renderProfile();
  closeSidebar();
}

/* ═══════════════════════════════════════════
   RENDER PROFILE
═══════════════════════════════════════════ */
function renderProfile() {
  var p = userProfile;
  if (!p) return;
  var initials = (p.name||'S').split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().slice(0,2);

  // Profile avatar — photo or initials
  var avatarEl = document.getElementById('profAvatar');
  if (p.photoURL) {
    avatarEl.innerHTML = '<img src="' + p.photoURL + '" alt="avatar">';
  } else {
    avatarEl.textContent = initials;
  }

  document.getElementById('profName').textContent        = p.name  || '—';
  document.getElementById('profRegno').textContent       = p.regno || '—';
  document.getElementById('profRoom').textContent        = p.room  ? 'Room ' + p.room  : '—';
  document.getElementById('profFloor').textContent       = p.room  ? 'Floor ' + Math.floor(Number(p.room) / 100) : '—';
  document.getElementById('profEmail').textContent       = p.email || currentUser.email || '—';
  document.getElementById('profMobile').textContent      = p.mobile || '—';
  document.getElementById('profParentMobile').textContent = p.parentMobile || '—';
}

/* ═══════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════ */
function loadDashboard() {
  var now   = new Date();
  var year  = now.getFullYear();
  var month = now.getMonth();

  // Attendance this month
  loadAttendanceMonth(year, month, function(data) {
    var days  = Object.values(data);
    var pres  = days.filter(function(d){ return d === 'present'; }).length;
    var abs   = days.filter(function(d){ return d === 'absent'; }).length;
    var total = pres + abs;
    var pct   = total > 0 ? Math.round((pres / total) * 100) : 0;

    document.getElementById('statPresent').textContent = pres;
    document.getElementById('statAbsent').textContent  = abs;
    document.getElementById('statPercent').textContent = pct + '%';
    document.getElementById('dashCalLabel').textContent = MONTHS[month] + ' ' + year;

    renderCalGrid('dashCalGrid', year, month, data);

    var el = document.getElementById('dashAttStats');
    el.innerHTML = '<div class="att-stat"><div class="att-dot present"></div>' + pres + ' Present</div>' +
                   '<div class="att-stat"><div class="att-dot absent"></div>' + abs + ' Absent</div>' +
                   '<div class="att-stat"><div class="att-dot no-data"></div>' + (days.length - pres - abs) + ' No Record</div>';
  });

  // Gatepasses — NO orderBy (avoids composite index requirement), sort client-side
  db.collection('gatepasses').where('studentUid', '==', currentUser.uid).get().then(function(snap) {
    document.getElementById('statGatepasses').textContent = snap.size;
    // Sort by timestamp descending client-side
    var sorted = snap.docs.slice().sort(function(a, b) {
      var aT = a.data().timestamp; var bT = b.data().timestamp;
      if (!aT) return 1; if (!bT) return -1;
      return bT.seconds - aT.seconds;
    });
    renderRecentGatepasses(sorted.slice(0, 3));
  }).catch(function(err) {
    toast('Could not load gatepasses: ' + err.message, 'error');
  });
}

/* ═══════════════════════════════════════════
   ATTENDANCE DATA — fetch each day individually
   (avoids composite index, works reliably)
═══════════════════════════════════════════ */
function loadAttendanceMonth(year, month, cb) {
  var monthStr    = year + '-' + String(month + 1).padStart(2, '0');
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var data        = {};
  var promises    = [];

  for (var d = 1; d <= daysInMonth; d++) {
    (function(day) {
      var key = monthStr + '-' + String(day).padStart(2, '0');
      promises.push(
        db.collection('attendance').doc(currentUser.uid).collection('records').doc(key).get()
          .then(function(doc) { if (doc.exists) data[key] = doc.data().status; })
          .catch(function(){})
      );
    })(d);
  }

  Promise.all(promises).then(function() { cb(data); });
}

/* ═══════════════════════════════════════════
   CALENDAR RENDERING
═══════════════════════════════════════════ */
function renderCalGrid(gridId, year, month, data) {
  var grid  = document.getElementById(gridId);
  var today = new Date();
  var first = new Date(year, month, 1).getDay();
  var last  = new Date(year, month + 1, 0).getDate();
  var isCurMonth = today.getFullYear() === year && today.getMonth() === month;

  var html = '';
  for (var i = 0; i < first; i++) html += '<div class="cal-cell empty"></div>';
  for (var d = 1; d <= last; d++) {
    var key  = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var stat = data[key];
    var isTd = isCurMonth && today.getDate() === d;
    var isFt = (year > today.getFullYear()) ||
               (year === today.getFullYear() && month > today.getMonth()) ||
               (isCurMonth && d > today.getDate());
    var cls = 'cal-cell';
    if (isTd)              cls += ' today';
    else if (isFt)         cls += ' future';
    else if (stat === 'present') cls += ' present';
    else if (stat === 'absent')  cls += ' absent';
    else                   cls += ' no-data';
    html += '<div class="' + cls + '" title="' + key + '">' + d + '</div>';
  }
  grid.innerHTML = html;
}

/* Full-page calendar */
function renderFullCalendar() {
  var now = new Date();
  if (calYear  === null) calYear  = now.getFullYear();
  if (calMonth === null) calMonth = now.getMonth();
  drawFullCal();
}

function changeMonth(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  drawFullCal();
}

function drawFullCal() {
  document.getElementById('fullCalLabel').textContent = MONTHS[calMonth] + ' ' + calYear;
  loadAttendanceMonth(calYear, calMonth, function(data) {
    var days  = Object.values(data);
    var pres  = days.filter(function(d){ return d === 'present'; }).length;
    var abs   = days.filter(function(d){ return d === 'absent'; }).length;
    var total = pres + abs;
    var pct   = total > 0 ? Math.round((pres / total) * 100) : 0;

    document.getElementById('attPresent').textContent = pres;
    document.getElementById('attAbsent').textContent  = abs;
    document.getElementById('attPct').textContent     = pct + '%';
    renderCalGrid('fullCalGrid', calYear, calMonth, data);
  });
}

/* ═══════════════════════════════════════════
   GATEPASS — SUBMIT
═══════════════════════════════════════════ */
document.getElementById('gatepassForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var btn    = document.getElementById('submitGatepassBtn');
  var out    = document.getElementById('outDate').value;
  var inX    = document.getElementById('inDate').value;
  var reason = document.getElementById('reason').value.trim();
  var type   = document.getElementById('leaveType').value;
  var phone  = document.getElementById('parentPhone').value.trim();

  if (!type)   { toast('Please select a leave type.', 'warning'); return; }
  if (!out)    { toast('Please enter departure date.', 'warning'); return; }
  if (!inX)    { toast('Please enter return date.', 'warning'); return; }
  if (!reason) { toast('Please enter a reason.', 'warning'); return; }
  if (new Date(inX) <= new Date(out)) {
    toast('Return date must be after departure date.', 'warning'); return;
  }

  btn.classList.add('loading');
  btn.textContent = 'Submitting...';

  db.collection('gatepasses').add({
    studentUid:  currentUser.uid,
    studentName: userProfile.name  || 'Unknown',
    regno:       userProfile.regno || '—',
    room:        userProfile.room  || '—',
    outDate:     out,
    inDate:      inX,
    reason:      reason,
    leaveType:   type,
    parentPhone: phone,
    status:      'pending',
    timestamp:   firebase.firestore.FieldValue.serverTimestamp(),
  }).then(function() {
    btn.classList.remove('loading');
    btn.textContent = '📤 Submit Request';
    toast('Gatepass request submitted successfully!', 'success');
    document.getElementById('gatepassForm').reset();
    showTab('mygatepass');
  }).catch(function(err) {
    btn.classList.remove('loading');
    btn.textContent = '📤 Submit Request';
    toast('Submit failed: ' + err.message, 'error');
  });
});

/* ═══════════════════════════════════════════
   MY GATEPASSES LIST
   — NO orderBy (avoids composite index), sort client-side
═══════════════════════════════════════════ */
function loadMyGatepasses() {
  var el = document.getElementById('myGatepassList');
  el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔄</div><p>Loading your requests...</p></div>';

  db.collection('gatepasses').where('studentUid', '==', currentUser.uid).get()
    .then(function(snap) {
      if (snap.empty) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No gatepass requests yet. ' +
          '<span style="color:var(--primary-light);cursor:pointer;" onclick="showTab(\'gatepass\')">Apply now →</span></p></div>';
        return;
      }
      // Sort by timestamp descending
      var sorted = snap.docs.slice().sort(function(a, b) {
        var aT = a.data().timestamp; var bT = b.data().timestamp;
        if (!aT) return 1; if (!bT) return -1;
        return bT.seconds - aT.seconds;
      });
      el.innerHTML = sorted.map(function(doc) { return gatepassCard(doc.id, doc.data()); }).join('');
    })
    .catch(function(err) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>' + err.message + '</p></div>';
    });
}

function renderRecentGatepasses(docs) {
  var el = document.getElementById('recentGatepasses');
  if (!docs.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No recent gatepasses. ' +
      '<span style="color:var(--primary-light);cursor:pointer;" onclick="showTab(\'gatepass\')">Apply now →</span></p></div>';
    return;
  }
  el.innerHTML = docs.map(function(doc) { return gatepassCard(doc.id, doc.data()); }).join('');
}

function gatepassCard(id, d) {
  var statusMap = {
    pending:  '<span class="badge badge-pending">⏳ Pending</span>',
    approved: '<span class="badge badge-approved">✅ Approved</span>',
    rejected: '<span class="badge badge-rejected">❌ Rejected</span>',
  };
  var fmtDate = function(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  };
  return '<div class="gatepass-item">' +
    '<div class="gatepass-icon">🚪</div>' +
    '<div class="gatepass-info">' +
      '<div class="gatepass-title">' + (d.leaveType||'Leave') + ' — ' + fmtDate(d.outDate) + '</div>' +
      '<div class="gatepass-meta">Return: ' + fmtDate(d.inDate) + ' &nbsp;•&nbsp; ' + (d.reason||'') + '</div>' +
    '</div>' +
    '<div>' + (statusMap[d.status] || '<span class="badge badge-pending">' + d.status + '</span>') + '</div>' +
  '</div>';
}

/* ═══════════════════════════════════════════
   SIDEBAR / LOGOUT
═══════════════════════════════════════════ */
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
   EDIT PROFILE MODAL
═══════════════════════════════════════════ */
var pendingPhotoURL = undefined; // undefined = no change, null = remove, string = new photo

function openEditModal() {
  var p = userProfile || {};
  pendingPhotoURL = undefined;

  // Pre-fill modal preview avatar
  var initials = (p.name||'S').split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().slice(0,2);
  var epAv = document.getElementById('epAvatar');
  if (p.photoURL) {
    epAv.innerHTML = '<img src="' + p.photoURL + '" alt="avatar">';
    document.getElementById('epRemoveBtn').style.display = 'inline';
  } else {
    epAv.textContent = initials;
    document.getElementById('epRemoveBtn').style.display = 'none';
  }

  // Pre-fill fields
  document.getElementById('epEmail').value        = p.email        || currentUser.email || '';
  document.getElementById('epMobile').value       = p.mobile       || '';
  document.getElementById('epParentMobile').value = p.parentMobile || '';

  // Reset file input
  document.getElementById('epPhotoInput').value = '';

  document.getElementById('editModal').classList.add('open');
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('editModal')) return;
  document.getElementById('editModal').classList.remove('open');
}

function handlePhotoUpload(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      // Resize to max 240x240 via canvas
      var size = 240;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      var ctx = canvas.getContext('2d');
      // Crop square from centre
      var min = Math.min(img.width, img.height);
      var sx = (img.width  - min) / 2;
      var sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      pendingPhotoURL = canvas.toDataURL('image/jpeg', 0.82);
      // Show preview
      var epAv = document.getElementById('epAvatar');
      epAv.innerHTML = '<img src="' + pendingPhotoURL + '" alt="avatar">';
      document.getElementById('epRemoveBtn').style.display = 'inline';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  pendingPhotoURL = null; // signal: delete photo
  var p = userProfile || {};
  var initials = (p.name||'S').split(' ').map(function(n){ return n[0]; }).join('').toUpperCase().slice(0,2);
  document.getElementById('epAvatar').textContent = initials;
  document.getElementById('epRemoveBtn').style.display = 'none';
  document.getElementById('epPhotoInput').value = '';
}

function saveProfile() {
  var email       = document.getElementById('epEmail').value.trim();
  var mobile      = document.getElementById('epMobile').value.trim();
  var parentMobile= document.getElementById('epParentMobile').value.trim();
  var btn         = document.getElementById('epSaveBtn');

  if (!email) { toast('Email address cannot be empty.', 'warning'); return; }

  btn.disabled    = true;
  btn.textContent = 'Saving...';

  var updates = { email: email, mobile: mobile, parentMobile: parentMobile };
  if (pendingPhotoURL !== undefined) {
    updates.photoURL = pendingPhotoURL || firebase.firestore.FieldValue.delete();
  }

  // Update Firestore first
  db.collection('users').doc(currentUser.uid).update(updates).then(function() {
    // Try to update Firebase Auth email too (best-effort)
    var authEmailUpdate = (email !== currentUser.email)
      ? currentUser.updateEmail(email).catch(function(err) {
          if (err.code === 'auth/requires-recent-login') {
            toast('Email updated in profile. Re-login to sync your auth email.', 'info');
          }
        })
      : Promise.resolve();

    return authEmailUpdate;
  }).then(function() {
    // Refresh local profile
    Object.assign(userProfile, updates);
    if (pendingPhotoURL === null) delete userProfile.photoURL;
    else if (pendingPhotoURL) userProfile.photoURL = pendingPhotoURL;

    localStorage.setItem('hms_user', JSON.stringify(userProfile));
    renderUserInfo();
    renderProfile();
    document.getElementById('editModal').classList.remove('open');
    btn.disabled    = false;
    btn.textContent = '💾 Save Changes';
    toast('Profile updated successfully!', 'success');
  }).catch(function(err) {
    btn.disabled    = false;
    btn.textContent = '💾 Save Changes';
    toast('Save failed: ' + err.message, 'error');
  });
}
