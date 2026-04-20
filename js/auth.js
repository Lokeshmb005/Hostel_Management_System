/* ═══════════════════════════════════════════════
   FIREBASE INIT  (keys come from config.js)
═══════════════════════════════════════════════ */
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db   = firebase.firestore();
// Cache Firestore data locally so reconnects don't cause "offline" errors
db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
  console.warn('Firestore persistence unavailable:', err.code);
});
const googleProvider = new firebase.auth.GoogleAuthProvider();



let currentRole    = 'student';
let registeredRole = null;
let redirecting    = false;

/* ═══════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════ */
function toast(msg, type = 'info') {
  const icons = { info:'ℹ️', success:'✅', error:'❌', warning:'⚠️' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span class="toast-icon">' + (icons[type]||'ℹ️') + '</span><span>' + msg + '</span>';
  document.getElementById('toast-container').appendChild(el);
  setTimeout(function(){ el.remove(); }, 4500);
}

/* ═══════════════════════════════════════════════
   LOADER
═══════════════════════════════════════════════ */
function hideLoader(){ document.getElementById('loader').classList.add('hidden'); }

/* ═══════════════════════════════════════════════
   AUTH STATE LISTENER
   Handles 4 scenarios on page load:
   (1) Not logged in                        → show login / restore signup flow if any
   (2) Logged in, NOT verified              → restore signup flow, show verify button
   (3) Logged in, verified, NO Firestore profile → show form to complete registration
   (4) Logged in, verified, HAS profile    → redirect straight to portal
═══════════════════════════════════════════════ */
auth.onAuthStateChanged(function(user) {
  if (redirecting) return;
  if (!user) { hideLoader(); return; }

  // Try with a 5s timeout to handle offline cases
  var timeout = setTimeout(function() {
    // Firestore taking too long — fall back to login
    hideLoader();
    auth.signOut();
  }, 5000);

  db.collection('users').doc(user.uid).get().then(function(doc) {
    clearTimeout(timeout);
    hideLoader();
    if (doc.exists) {
      if (redirecting) return;
      redirecting = true;
      var role = doc.data().role;
      localStorage.setItem('hms_user', JSON.stringify(Object.assign({ uid: user.uid }, doc.data())));
      window.location.href = role === 'warden' ? 'warden.html' : 'student.html';
    }
    // no profile yet — stay on login/signup page
  }).catch(function(err) {
    clearTimeout(timeout);
    hideLoader();
    // Offline or unavailable — sign out silently and show login
    if (err.code === 'unavailable' || (err.message && err.message.toLowerCase().includes('offline'))) {
      auth.signOut().catch(function(){}); // clear the stale session
      // No toast — just show the login form silently
      return;
    }
    toast('Could not connect. Please check your internet and try again.', 'warning');
  });
});

/* ═══════════════════════════════════════════════
   RESTORE SIGNUP FLOW
═══════════════════════════════════════════════ */
function restoreSignupFlow(flow) {
  showSignup();
  setRole(flow.role || 'student');
  if (flow.name)    document.getElementById('signupName').value  = flow.name;
  if (flow.email)   document.getElementById('signupEmail').value = flow.email;
  if (flow.regno)   document.getElementById('regno').value       = flow.regno;
  if (flow.staffid) document.getElementById('staffid').value     = flow.staffid;
  if (flow.room)    document.getElementById('roomNo').value      = flow.room;
  if (flow.floor)   document.getElementById('floorNo').value     = flow.floor;
}

/* ═══════════════════════════════════════════════
   ROLE SELECTOR
═══════════════════════════════════════════════ */
function setRole(r) {
  currentRole = r;
  document.getElementById('pillStudent').classList.toggle('active', r === 'student');
  document.getElementById('pillWarden').classList.toggle('active',  r === 'warden');
  document.getElementById('regnoGroup').classList.toggle('hidden',  r !== 'student');
  document.getElementById('roomGroup').classList.toggle('hidden',   r !== 'student');
  document.getElementById('parentMobileGroup').classList.toggle('hidden', r !== 'student');
  document.getElementById('staffGroup').classList.toggle('hidden',  r !== 'warden');
  document.getElementById('floorGroup').classList.toggle('hidden',  r !== 'warden');
}

/* ═══════════════════════════════════════════════
   SECTION VISIBILITY
═══════════════════════════════════════════════ */
function showSignup() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('successSection').classList.add('hidden');
  document.getElementById('forgotSection').classList.add('hidden');
  document.getElementById('signupSection').classList.remove('hidden');
}
function showLogin() {
  document.getElementById('signupSection').classList.add('hidden');
  document.getElementById('successSection').classList.add('hidden');
  document.getElementById('forgotSection').classList.add('hidden');
  document.getElementById('loginSection').classList.remove('hidden');
}
function showForgotPassword() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('signupSection').classList.add('hidden');
  document.getElementById('successSection').classList.add('hidden');
  document.getElementById('forgotSection').classList.remove('hidden');
  // Pre-fill email if they typed one
  var typed = document.getElementById('loginEmail').value.trim();
  if (typed) document.getElementById('resetEmail').value = typed;
}

// Go back from verify screen to signup form
function goBackToSignupForm() {
  // Sign out the unverified user so they can start fresh
  var user = auth.currentUser;
  var doBack = function() {
    sessionStorage.removeItem('hms_signup_flow');
    // Show signup form fully
    document.getElementById('verifyArea').classList.add('hidden');
    document.getElementById('signupFormArea').classList.remove('hidden');
    toast('You can edit your details and resend the verification email.', 'info');
  };
  if (user && !user.emailVerified) {
    // Delete the unverified account so they can re-register with same email
    user.delete().then(doBack).catch(function() { doBack(); });
  } else {
    doBack();
  }
}

function showSuccess(name, role) {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('signupSection').classList.add('hidden');
  document.getElementById('successSection').classList.remove('hidden');
  document.getElementById('successName').textContent = 'Hello, ' + name + '! 👋';
  registeredRole = role;

  // Countdown auto-redirect
  var secs = 3;
  document.getElementById('countdown').textContent = secs;
  var ticker = setInterval(function() {
    secs--;
    var el = document.getElementById('countdown');
    if (el) el.textContent = secs;
    if (secs <= 0) { clearInterval(ticker); goToPortal(); }
  }, 1000);
}

function goToPortal() {
  if (redirecting) return;
  redirecting = true;
  sessionStorage.removeItem('hms_signup_flow');
  window.location.href = registeredRole === 'warden' ? 'warden.html' : 'student.html';
}

/* ═══════════════════════════════════════════════
   LOGIN
═══════════════════════════════════════════════ */
document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var email    = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
  var btn      = document.getElementById('loginBtn');

  btn.classList.add('loading');
  btn.textContent = 'Signing in...';

  auth.signInWithEmailAndPassword(email, password).then(function(cred) {
    return db.collection('users').doc(cred.user.uid).get().then(function(doc) {
      if (!doc.exists) {
        btn.classList.remove('loading');
        btn.textContent = 'Sign In';
        toast('Profile not found. Please register first.', 'error');
        return;
      }
      var role = doc.data().role;
      localStorage.setItem('hms_user', JSON.stringify(Object.assign({ uid: cred.user.uid }, doc.data())));
      toast('Signed in successfully! Redirecting...', 'success');
      btn.textContent = 'Redirecting...';
      redirecting = true;
      setTimeout(function() {
        window.location.href = role === 'warden' ? 'warden.html' : 'student.html';
      }, 800);
    });
  }).catch(function(err) {
    btn.classList.remove('loading');
    btn.textContent = 'Sign In';
    var msg = err.code === 'auth/user-not-found'   ? 'No account found with this email.' :
              err.code === 'auth/wrong-password'    ? 'Incorrect password. Please try again.' :
              err.code === 'auth/invalid-credential'? 'Incorrect email or password.' :
              err.code === 'auth/invalid-email'     ? 'Please enter a valid email address.' :
              err.code === 'auth/too-many-requests' ? 'Too many failed attempts. Try again later.' :
              err.message;
    toast(msg, 'error');
  });
});

/* ═══════════════════════════════════════════════
   SIGNUP — Direct (no email verification)
═══════════════════════════════════════════════ */
function signup() {
  var name    = document.getElementById('signupName').value.trim();
  var email   = document.getElementById('signupEmail').value.trim();
  var pass    = document.getElementById('signupPassword').value;
  var confirm = document.getElementById('signupConfirm').value;
  var mobile  = document.getElementById('signupMobile').value.trim();
  var parentMobile = document.getElementById('parentMobile').value.trim();
  var regno   = document.getElementById('regno').value.trim();
  var staffid = document.getElementById('staffid').value.trim();
  var room    = document.getElementById('roomNo').value.trim();
  var floor   = document.getElementById('floorNo').value.trim();
  var btn     = document.getElementById('signupBtn');

  if (!name)               { toast('Please enter your full name.', 'warning'); return; }
  if (!email)              { toast('Please enter your email address.', 'warning'); return; }
  if (pass.length < 6)     { toast('Password must be at least 6 characters.', 'warning'); return; }
  if (pass !== confirm)    { toast('Passwords do not match. Please re-enter.', 'warning'); return; }
  if (currentRole === 'student' && !regno)   { toast('Please enter your register number.', 'warning'); return; }
  if (currentRole === 'warden'  && !staffid) { toast('Please enter your staff ID.', 'warning'); return; }

  btn.classList.add('loading');
  btn.textContent = 'Creating account...';

  auth.createUserWithEmailAndPassword(email, pass).then(function(cred) {
    var data = { name: name, email: email, role: currentRole };
    if (mobile) data.mobile = mobile;
    if (currentRole === 'student') {
      data.regno = regno; data.room = room;
      if (parentMobile) data.parentMobile = parentMobile;
    } else {
      data.staffid = staffid; data.floor = floor;
    }

    return db.collection('users').doc(cred.user.uid).set(data).then(function() {
      localStorage.setItem('hms_user', JSON.stringify(Object.assign({ uid: cred.user.uid }, data)));
      btn.classList.remove('loading');
      btn.textContent = '🚀 Create Account';
      showSuccess(name, currentRole);
    });
  }).catch(function(err) {
    btn.classList.remove('loading');
    btn.textContent = '🚀 Create Account';
    var msg = err.code === 'auth/email-already-in-use' ? 'This email is already registered. Please sign in.' :
              err.code === 'auth/invalid-email'         ? 'Please enter a valid email address.' :
              err.code === 'auth/weak-password'         ? 'Password must be at least 6 characters.' :
              err.message;
    toast(msg, 'error');
  });
}

/* ═══════════════════════════════════════════════
   GOOGLE SIGN-IN (Login page)
═══════════════════════════════════════════════ */
function signInWithGoogle() {
  var btn = document.getElementById('loginGoogleBtn');
  btn.disabled = true;
  btn.textContent = 'Opening Google...';

  auth.signInWithPopup(googleProvider).then(function(result) {
    return db.collection('users').doc(result.user.uid).get().then(function(doc) {
      if (!doc.exists) {
        btn.disabled = false;
        btn.innerHTML = '&#9188; Continue with Google';
        showSignup();
        if (result.user.displayName) document.getElementById('signupName').value = result.user.displayName;
        toast('Welcome! Please fill in your hostel details to complete registration.', 'info');
        return;
      }
      var role = doc.data().role;
      localStorage.setItem('hms_user', JSON.stringify(Object.assign({ uid: result.user.uid }, doc.data())));
      toast('Signed in with Google! Redirecting...', 'success');
      redirecting = true;
      window.location.href = role === 'warden' ? 'warden.html' : 'student.html';
    });
  }).catch(function(err) {
    btn.disabled = false;
    btn.innerHTML = '&#9188; Continue with Google';
    if (err.code !== 'auth/popup-closed-by-user') {
      toast(err.code === 'auth/unauthorized-domain'
        ? 'Google login blocked — please use Email/Password login instead.'
        : err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════
   GOOGLE SIGN-UP — opens popup immediately, no pre-validation
═══════════════════════════════════════════════ */
var googleUid   = null;
var googleEmail = null;
var gRole = 'student';

const GOOGLE_SVG = '<svg width="18" height="18" viewBox="0 0 48 48" style="flex-shrink:0;"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg> Continue with Google';

function signUpWithGoogle() {
  var btn = document.getElementById('signupGoogleBtn');
  btn.disabled = true;
  btn.textContent = 'Opening Google...';

  auth.signInWithPopup(googleProvider).then(function(result) {
    var user = result.user;
    return db.collection('users').doc(user.uid).get().then(function(doc) {
      btn.disabled = false;
      btn.innerHTML = GOOGLE_SVG;

      if (doc.exists) {
        // Already registered — just redirect
        var role = doc.data().role;
        localStorage.setItem('hms_user', JSON.stringify(Object.assign({ uid: user.uid }, doc.data())));
        toast('Welcome back! Redirecting...', 'success');
        redirecting = true;
        window.location.href = role === 'warden' ? 'warden.html' : 'student.html';
        return;
      }

      // New user — store uid/email and show the hostel details step
      googleUid   = user.uid;
      googleEmail = user.email;
      document.getElementById('googleUserEmail').textContent = user.email;
      if (user.displayName) document.getElementById('gName').value = user.displayName;
      setGRole('student');

      document.getElementById('emailSignupPath').classList.add('hidden');
      document.getElementById('googleDetailsStep').classList.remove('hidden');
    });
  }).catch(function(err) {
    btn.disabled = false;
    btn.innerHTML = GOOGLE_SVG;
    if (err.code !== 'auth/popup-closed-by-user') {
      toast(err.code === 'auth/unauthorized-domain'
        ? '⚠️ Google sign-in is blocked on this domain. Please add localhost to Firebase Authorized Domains.'
        : err.message, 'error');
    }
  });
}

/* Role selector for the Google details step */
function setGRole(r) {
  gRole = r;
  document.getElementById('gpillStudent').classList.toggle('active', r === 'student');
  document.getElementById('gpillWarden').classList.toggle('active',  r === 'warden');
  document.getElementById('gregnoGroup').classList.toggle('hidden',  r !== 'student');
  document.getElementById('groomGroup').classList.toggle('hidden',   r !== 'student');
  document.getElementById('gparentMobileGroup').classList.toggle('hidden', r !== 'student');
  document.getElementById('gstaffGroup').classList.toggle('hidden',  r !== 'warden');
  document.getElementById('gfloorGroup').classList.toggle('hidden',  r !== 'warden');
}

/* Save profile after Google auth */
function saveGoogleProfile() {
  var name    = document.getElementById('gName').value.trim();
  var mobile  = document.getElementById('gMobile').value.trim();
  var parentMobile = document.getElementById('gParentMobile').value.trim();
  var regno   = document.getElementById('gregno').value.trim();
  var staffid = document.getElementById('gstaffid').value.trim();
  var room    = document.getElementById('groomNo').value.trim();
  var floor   = document.getElementById('gfloorNo').value.trim();
  var btn     = document.getElementById('saveGoogleBtn');

  if (!name) { toast('Please enter your full name.', 'warning'); return; }
  if (gRole === 'student' && !regno)   { toast('Please enter your register number.', 'warning'); return; }
  if (gRole === 'warden'  && !staffid) { toast('Please enter your staff ID.', 'warning'); return; }

  btn.classList.add('loading');
  btn.textContent = 'Saving...';

  var data = { name: name, email: googleEmail, role: gRole };
  if (mobile) data.mobile = mobile;
  if (gRole === 'student') {
    data.regno = regno; data.room = room;
    if (parentMobile) data.parentMobile = parentMobile;
  } else {
    data.staffid = staffid; data.floor = floor;
  }

  db.collection('users').doc(googleUid).set(data).then(function() {
    localStorage.setItem('hms_user', JSON.stringify(Object.assign({ uid: googleUid }, data)));
    btn.classList.remove('loading');
    btn.textContent = '💾 Save & Go to Portal';
    showSuccess(name, gRole);
  }).catch(function(err) {
    btn.classList.remove('loading');
    btn.textContent = '💾 Save & Go to Portal';
    toast('Failed to save profile: ' + err.message, 'error');
  });
}

/* Cancel Google path — go back to email form */
function cancelGoogleSignup() {
  googleUid = null; googleEmail = null;
  auth.signOut();
  document.getElementById('googleDetailsStep').classList.add('hidden');
  document.getElementById('emailSignupPath').classList.remove('hidden');
}



/* ═══════════════════════════════════════════════
   FORGOT PASSWORD
═══════════════════════════════════════════════ */
function forgotPassword() {
  var email = document.getElementById('resetEmail').value.trim();
  if (!email) { toast('Please enter your email address.', 'warning'); return; }

  var btn = document.getElementById('resetBtn');
  btn.classList.add('loading');
  btn.textContent = 'Sending...';

  auth.sendPasswordResetEmail(email)
    .then(function() {
      btn.classList.remove('loading');
      btn.textContent = '📧 Send Reset Link';
      toast('Password reset link sent to ' + email + '! Check your inbox.', 'success');
      document.getElementById('resetEmail').value = '';
      // Go back to login after short delay
      setTimeout(function() { showLogin(); }, 2500);
    })
    .catch(function(err) {
      btn.classList.remove('loading');
      btn.textContent = '📧 Send Reset Link';
      var msg = err.code === 'auth/user-not-found'  ? 'No account found with this email address.' :
                err.code === 'auth/invalid-email'   ? 'Please enter a valid email address.' :
                err.code === 'auth/too-many-requests' ? 'Too many requests. Please try again later.' :
                err.message;
      toast(msg, 'error');
    });
}
