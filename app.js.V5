import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  runTransaction, onSnapshot, query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8tJuU-3dnSqHwxBwIFpV60WC5Qs8fFWU",
  authDomain: "multiplayer-tic-tac-toe-8aac0.firebaseapp.com",
  projectId: "multiplayer-tic-tac-toe-8aac0",
  storageBucket: "multiplayer-tic-tac-toe-8aac0.firebasestorage.app",
  messagingSenderId: "130348640052",
  appId: "1:130348640052:web:e4edb00fb6da0d79072761",
  measurementId: "G-MJ5GP11WPN"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = selector => document.querySelector(selector);
const screens = ["home-screen", "lobby-screen", "waiting-screen", "game-screen", "result-screen"];
let resolveAuthReady;
const authReady = new Promise(resolve => { resolveAuthReady = resolve; });
const state = {
  user: null, username: localStorage.getItem("ticTacToeName") || "",
  roomId: null, room: null, symbol: null, roomUnsub: null, searchTimer: null,
  waitStarted: 0, waitInterval: null, waitTimeout: null, isHost: false,
  dialogResolve: null, toastTimer: null, lastRenderedStatus: null, finishedRoomId: null, searching: false, rematchPending: false, waitingMode: null, searchSession: 0, resultDelayTimer: null
};
const INTRO_MS = 3700;
let introComplete = false;
let initialFlowStarted = false;
const MAX_SEARCH_MS = 120000;
const wins = [[0,1,2],[3,4,5],[6,7,8],[0,4,8],[2,4,6],[0,3,6],[1,4,7],[2,5,8]];

function showScreen(id) {
  screens.forEach(screen => $("#" + screen).classList.toggle("hidden", screen !== id));
  $("#change-name").classList.toggle("hidden", id === "home-screen");
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("visible");
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove("visible"), 2600);
}
function cleanName(value) { return value.trim().replace(/\s+/g, " ").slice(0, 18); }
function safeText(el, value) { el.textContent = value; }
function dialog({title, message, icon = "✳", buttons = [{label:"Okay", value:true, primary:true}], closeable = true}) {
  safeText($("#dialog-title"), title);
  $("#dialog-icon").textContent = icon;
  const body = $("#dialog-message"); body.replaceChildren();
  if (typeof message === "string") {
    const p = document.createElement("p"); p.textContent = message; body.append(p);
  } else body.append(message);
  const actions = $("#dialog-actions"); actions.replaceChildren();
  $("#dialog-close").classList.toggle("hidden", !closeable);
  $("#dialog-backdrop").classList.remove("hidden");
  return new Promise(resolve => {
    state.dialogResolve = resolve;
    buttons.forEach((item, index) => {
      const button = document.createElement("button");
      button.className = "button " + (item.primary ? "button-primary" : "button-quiet");
      button.textContent = item.label;
      button.addEventListener("click", () => closeDialog(item.value));
      actions.append(button);
      if (item.primary || index === buttons.length - 1) setTimeout(() => button.focus(), 0);
    });
  });
}
function closeDialog(value = false) {
  $("#dialog-backdrop").classList.add("hidden");
  if (state.dialogResolve) state.dialogResolve(value);
  state.dialogResolve = null;
}
function profileDialog() {
  const wrap = document.createElement("div");
  const label = document.createElement("label"); label.textContent = "YOUR PLAYER NAME";
  const input = document.createElement("input"); input.maxLength = 18; input.autocomplete = "nickname";
  input.placeholder = "e.g. Wasi"; input.value = state.username; input.id = "name-dialog-input";
  label.htmlFor = input.id; wrap.append(label, input);
  const promise = dialog({
    title: state.username ? "Edit your name" : "First, what should we call you?",
    message: wrap, icon: "✎", closeable: !!state.username,
    buttons: [
      ...(state.username ? [{label:"Cancel", value:false}] : []),
      {label:"Continue", value:"save", primary:true}
    ]
  });
  setTimeout(() => input.focus(), 40);
  return promise.then(value => {
    if (value !== "save") return false;
    const name = cleanName(input.value);
    if (name.length < 2) {
      return dialog({title:"Add a little more",message:"Your name needs at least two characters.",icon:"!",buttons:[{label:"Try again",value:true,primary:true}]}).then(() => profileDialog());
    }
    state.username = name; localStorage.setItem("ticTacToeName", name);
    return true;
  });
}
function privacyDialog() {
  const copy = document.createElement("div"); copy.className = "privacy-copy";
  copy.innerHTML = `
    <p>Welcome to TIC TAC TOE. Here’s the short version of how this little game works.</p>
    <h3>YOUR NAME</h3><p>Your display name is saved in this browser so you don't need to enter it every time. You can change it later.</p>
    <h3>MULTIPLAYER</h3><p>The game uses Firebase to connect players and sync board moves. A temporary anonymous Firebase identity is used behind the scenes; there is no password or account form.</p>
    <h3>GAME DATA</h3><p>Room codes, player display names, board moves and match status are stored in the game's Firestore database so your opponent can see the same match.</p>
    <h3>YOUR CHOICE</h3><p>Don't include private or sensitive information in your player name. Leaving a match returns you to the lobby.</p>
    <p>By continuing, you acknowledge this basic privacy notice.</p>`;
  return dialog({title:"A quick privacy note",message:copy,icon:"✓",closeable:false,buttons:[{label:"Got it, let's play",value:true,primary:true}]});
}
function goLobby() {
  $("#hello-name").textContent = state.username;
  $("#avatar").textContent = state.username.charAt(0).toUpperCase() || "?";
  showScreen("lobby-screen");
}
function stopWaitingClock() {
  clearInterval(state.waitInterval); clearTimeout(state.waitTimeout);
  state.waitInterval = state.waitTimeout = null;
}
function stopRoomListener() {
  if (state.roomUnsub) state.roomUnsub();
  state.roomUnsub = null;
}
function stopAll() { stopRoomListener(); stopWaitingClock(); clearTimeout(state.resultDelayTimer); state.resultDelayTimer = null; }
function setWaiting(title, description, status, mode = "quick") {
  $("#waiting-title").textContent = title;
  $("#waiting-description").textContent = description;
  $("#waiting-status-text").textContent = status;
  $("#room-code-block").classList.add("hidden");
  $("#waiting-hint").textContent = "Keep this page open while we look.";
  $("#search-progress-bar").style.width = "4%";
  $("#search-time").textContent = "00:00";
  state.waitingMode = mode;
  $("#search-time").classList.toggle("hidden", mode === "private");
  $("#search-progress-bar").parentElement.classList.toggle("hidden", mode === "private");
  $("#cancel-wait").textContent = mode === "private" ? "← Leave room" : "← Back to lobby";
  showScreen("waiting-screen");
}
function startWaitingClock() {
  stopWaitingClock();
  state.waitStarted = Date.now();
  state.waitInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.waitStarted) / 1000);
    $("#search-time").textContent = `${String(Math.floor(elapsed / 60)).padStart(2,"0")}:${String(elapsed % 60).padStart(2,"0")}`;
    $("#search-progress-bar").style.width = `${Math.min(95, 4 + elapsed / 120 * 91)}%`;
    if (elapsed >= 20 && elapsed < 45) $("#waiting-status-text").textContent = "Still searching for a player…";
    else if (elapsed >= 45 && elapsed < 90) $("#waiting-status-text").textContent = "Checking for newly available players…";
    else if (elapsed >= 90) $("#waiting-status-text").textContent = "Almost there — still looking…";
  }, 1000);
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
}
async function createRoom(mode = "private", searchSession = null) {
  try {
    const user = state.user || await authReady;
    if (!user) {
      const authError = new Error("AUTH_UNAVAILABLE");
      authError.code = "auth/unavailable";
      throw authError;
    }
    const roomRef = doc(collection(db, "rooms"));
    await setDoc(roomRef, {
      code: makeCode(), status: "waiting", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      players: {X:{uid:user.uid,name:state.username},O:null}, board:Array(9).fill(""),
      turn:"X", winner:null, winningLine:[], lastMoveAt:null, mode
    });
    if (searchSession !== null && searchSession !== state.searchSession) {
      // The user cancelled while the create request was in flight. Close the room if
      // nobody claimed it yet so it cannot become a ghost opponent for another player.
      const outcome = await retireOwnWaitingRoom(roomRef.id);
      if (outcome === "playing" || outcome === "finished") {
        state.isHost = true;
        state.symbol = "X";
        watchRoom(roomRef.id);
      }
      return roomRef.id;
    }
    state.isHost = true; state.symbol = "X"; watchRoom(roomRef.id);
    return roomRef.id;
  } catch (error) {
    console.error("createRoom", error);
    throw error;
  }
}
function watchRoom(roomId) {
  stopRoomListener(); state.roomId = roomId; state.finishedRoomId = null;
  state.roomUnsub = onSnapshot(doc(db,"rooms",roomId), snap => {
    if (!snap.exists()) {
      stopAll();
      dialog({title:"Room unavailable",message:"This room has closed or expired. Head back to the lobby to start another match.",icon:"!",buttons:[{label:"Back to lobby",value:true,primary:true}]}).then(goLobby);
      return;
    }
    const room = snap.data(); state.room = room;
    const mySymbol = room.players?.X?.uid === state.user?.uid ? "X"
      : room.players?.O?.uid === state.user?.uid ? "O" : null;
    state.symbol = mySymbol;
    if (!mySymbol) {
      stopAll();
      state.searching = false;
      state.roomId = null; state.room = null; state.symbol = null;
      dialog({title:"Room assignment issue",message:"This device isn't one of the two players assigned to this room. The game has stopped here to prevent inconsistent turns. Return to the lobby and start a fresh match.",icon:"!",buttons:[{label:"Back to lobby",value:true,primary:true}]}).then(goLobby);
      return;
    }
    if (room.status === "playing" || room.status === "finished") {
      stopWaitingClock();
      if (room.status === "playing") {
        clearTimeout(state.resultDelayTimer);
        state.resultDelayTimer = null;
        state.finishedRoomId = null;
        state.rematchPending = false;
      }
      renderGame(room);
      if (room.status === "finished" && state.finishedRoomId !== state.roomId && !state.resultDelayTimer) {
        // Keep the board visible while the winner line draws before revealing the result.
        const delay = room.winner === "draw" ? 250 : 900;
        state.resultDelayTimer = setTimeout(() => {
          state.resultDelayTimer = null;
          if (state.room?.status === "finished" && state.roomId) renderResult(state.room);
        }, delay);
      }
    } else if (room.status === "waiting") {
      $("#room-code-display").textContent = room.code;
      $("#room-code-block").classList.toggle("hidden", room.mode !== "private");
      $("#search-time").classList.toggle("hidden", room.mode === "private");
      $("#search-progress-bar").parentElement.classList.toggle("hidden", room.mode === "private");
      $("#cancel-wait").textContent = room.mode === "private" ? "← Leave room" : "← Stop searching";
      if (room.mode === "private") {
        $("#waiting-eyebrow").textContent = "PRIVATE ROOM";
        $("#waiting-title").textContent = "Your room is ready.";
        $("#waiting-description").textContent = "Share the code with a friend. Their seat is waiting.";
        $("#waiting-status-text").textContent = "Waiting for the other player";
      }
    } else if (room.status === "closed") {
      stopAll();
      dialog({title:"Match ended",message:"This room was closed. You can start a new game any time.",icon:"i",buttons:[{label:"Back to lobby",value:true,primary:true}]}).then(goLobby);
    }
  }, error => {
    console.error("room listener", error);
    stopAll();
    dialog({title:"Connection interrupted",message:"We lost the live room connection. Check your internet and Firebase setup, then try again.",icon:"!",buttons:[{label:"Back to lobby",value:true,primary:true}]}).then(goLobby);
  });
}
async function joinRoomByCode(rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    await dialog({title:"Check the room code",message:"Room codes contain exactly six letters or numbers.",icon:"!",buttons:[{label:"Try again",value:true,primary:true}]}); return;
  }
  try {
    const user = state.user || await authReady;
    if (!user) {
      const authError = new Error("AUTH_UNAVAILABLE");
      authError.code = "auth/unavailable";
      throw authError;
    }
    // A single-field query avoids a composite-index requirement. Check status on the client,
    // then re-check it atomically in the transaction before claiming the seat.
    const q = query(collection(db,"rooms"),where("code","==",code));
    const found = await getDocs(q);
    const candidate = found.docs.find(item => item.data().status === "waiting" && item.data().players?.O == null);
    if (!candidate) { await dialog({title:"No open room found",message:"That room may have started already, or the code may be incorrect. Ask your friend to check the code.",icon:"!",buttons:[{label:"Okay",value:true,primary:true}]}); return; }
    await runTransaction(db,async tx => {
      const snap = await tx.get(candidate.ref);
      if (!snap.exists()) throw new Error("ROOM_TAKEN");
      const room = snap.data();
      if (room.status !== "waiting" || room.players?.O) throw new Error("ROOM_TAKEN");
      if (room.players?.X?.uid === user.uid) throw new Error("SAME_PLAYER");
      tx.update(candidate.ref,{"players.O":{uid:user.uid,name:state.username},status:"playing",updatedAt:serverTimestamp()});
    });
    state.isHost = false; state.symbol = "O"; watchRoom(candidate.id);
  } catch (error) {
    console.error("joinRoomByCode", error);
    const message = error.message === "SAME_PLAYER" ? "You can't join your own room from the same browser session." :
      error.message === "ROOM_TAKEN" ? "That room was just filled. Ask for another code or try quick match." :
      "We couldn't join the room right now. Check your connection and try again.";
    await dialog({title:"Couldn't join this room",message,icon:"!",buttons:[{label:"Okay",value:true,primary:true}]});
  }
}
function roomCreatedMs(room) {
  const value = room?.createdAt;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function retireOwnWaitingRoom(roomId) {
  if (!roomId || !state.user) return "none";
  const ref = doc(db, "rooms", roomId);
  const isCurrentRoom = state.roomId === roomId;
  if (isCurrentRoom) stopRoomListener();
  const outcome = await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return "gone";
    const room = snap.data();
    const me = room.players?.X?.uid === state.user.uid ? "X"
      : room.players?.O?.uid === state.user.uid ? "O" : null;
    if (!me) return "not-player";
    if (room.status === "playing" || room.status === "finished") return room.status;
    if (room.status === "waiting" && me === "X" && room.players?.O == null) {
      tx.update(ref, {status:"closed", updatedAt:serverTimestamp()});
    }
    return "closed";
  });
  if (outcome === "playing" || outcome === "finished") {
    if (isCurrentRoom) watchRoom(roomId);
    return outcome;
  }
  if (isCurrentRoom) {
    state.roomId = null;
    state.room = null;
    state.symbol = null;
    state.isHost = false;
  }
  return outcome;
}
async function closeCurrentWaitingRoomQuietly() {
  if (!state.roomId || !state.isHost) return "none";
  try {
    return await retireOwnWaitingRoom(state.roomId);
  } catch (error) {
    console.warn("couldn't close stale waiting room", error);
    return "error";
  }
}
async function findQuickMatch() {
  if (state.searching) return;
  state.searching = true;
  const session = ++state.searchSession;
  stopAll();
  state.roomId = null; state.room = null; state.symbol = null;
  state.finishedRoomId = null; state.isHost = false;

  setWaiting("Finding your next opponent.", "Searching for another player. This can take a little moment.", "Connecting to matchmaking…", "quick");
  startWaitingClock();

  try {
    const user = state.user || await authReady;
    if (!user) {
      const authError = new Error("AUTH_UNAVAILABLE");
      authError.code = "auth/unavailable";
      throw authError;
    }
    const deadline = Date.now() + MAX_SEARCH_MS;

    while (session === state.searchSession && Date.now() < deadline && !$("#waiting-screen").classList.contains("hidden")) {
      // One equality filter only: no compound index or orderBy index is required.
      const q = query(collection(db, "rooms"), where("mode", "==", "quick"));
      const snapshot = await getDocs(q);
      if (session !== state.searchSession) return;
      const now = Date.now();
      const waiting = snapshot.docs
        .map(item => ({id:item.id, ref:item.ref, room:item.data()}))
        .filter(item => {
          const r = item.room;
          const age = now - roomCreatedMs(r);
          return r.status === "waiting"
            && r.mode === "quick"
            && r.players?.X?.uid
            && r.players?.O == null
            && roomCreatedMs(r) > 0
            && age >= -5000
            && age <= MAX_SEARCH_MS;
        })
        .sort((a,b) => roomCreatedMs(a.room)-roomCreatedMs(b.room) || a.id.localeCompare(b.id));

      // A room we own may have filled since the last listener event.
      if (state.roomId && state.isHost) {
        const ownSnap = await getDoc(doc(db, "rooms", state.roomId));
        if (session !== state.searchSession) return;
        if (ownSnap.exists() && ownSnap.data().status === "playing") {
          state.searching = false;
          watchRoom(state.roomId);
          return;
        }
        if (!ownSnap.exists() || ownSnap.data().status === "closed") {
          stopRoomListener();
          state.roomId = null; state.room = null; state.symbol = null; state.isHost = false;
        }
      }

      const myWaitingRoom = waiting.find(item => item.room.players?.X?.uid === user.uid);
      const oldest = waiting[0];

      // All simultaneous searches converge on the same oldest room. Newer room hosts
      // retire their own room before joining, so nobody is left waiting in an orphan.
      if (oldest && oldest.room.players.X.uid !== user.uid) {
        if (state.roomId && state.isHost) {
          const ownId = state.roomId;
          const outcome = await retireOwnWaitingRoom(ownId);
          if (outcome === "playing" || outcome === "finished") {
            state.searching = false;
            return;
          }
        }

        try {
          await runTransaction(db, async tx => {
            const snap = await tx.get(oldest.ref);
            if (!snap.exists()) throw new Error("ROOM_TAKEN");
            const room = snap.data();
            const age = Date.now() - roomCreatedMs(room);
            if (room.status !== "waiting" || room.mode !== "quick"
                || room.players?.O != null
                || room.players?.X?.uid === user.uid
                || age < -5000 || age > MAX_SEARCH_MS) {
              throw new Error("ROOM_TAKEN");
            }
            tx.update(oldest.ref, {
              "players.O": {uid:user.uid, name:state.username},
              status:"playing",
              updatedAt:serverTimestamp()
            });
          });
          state.searching = false;
          state.isHost = false;
          state.symbol = "O";
          watchRoom(oldest.id);
          return;
        } catch (error) {
          if (error.message !== "ROOM_TAKEN") throw error;
          // Someone else claimed it first. Re-read on the next loop.
        }
      } else if (myWaitingRoom) {
        if (!state.roomId || state.roomId !== myWaitingRoom.id) {
          state.isHost = true;
          watchRoom(myWaitingRoom.id);
        }
      } else if (!state.roomId) {
        await createRoom("quick", session);
        $("#waiting-eyebrow").textContent = "QUICK MATCH";
        $("#waiting-title").textContent = "You’re first in line.";
        $("#waiting-description").textContent = "Your room is ready. We’ll keep looking for someone to join.";
        $("#waiting-status-text").textContent = "Waiting for another player";
      }

      await new Promise(resolve => { state.searchTimer = setTimeout(resolve, 1800); });
      if (session !== state.searchSession) return;
      if ($("#waiting-screen").classList.contains("hidden")) {
        state.searching = false;
        return;
      }
      $("#waiting-status-text").textContent = "Checking for available players…";
    }

    if (session !== state.searchSession) return;
    state.searching = false;
    stopWaitingClock();
    $("#waiting-status-text").textContent = "No match found yet";
    $("#waiting-hint").textContent = "You can keep waiting or return to the lobby.";
    await dialog({
      title:"No player found yet",
      message:"We searched for up to two minutes, but nobody joined this quick match. You can keep waiting or return to the lobby.",
      icon:"⌁",
      buttons:[{label:"Back to lobby",value:"lobby"},{label:"Keep waiting",value:"wait",primary:true}]
    }).then(async choice => {
      if (session !== state.searchSession) return;
      const outcome = await closeCurrentWaitingRoomQuietly();
      if (outcome === "playing" || outcome === "finished") {
        state.searching = false;
        return;
      }
      stopAll();
      state.roomId = null; state.room = null; state.symbol = null; state.isHost = false;
      if (choice === "wait") findQuickMatch();
      else goLobby();
    });
  } catch (error) {
    if (session !== state.searchSession) return;
    console.error("quick matchmaking failed", {code:error?.code, message:error?.message, error});
    state.searching = false;
    stopWaitingClock();
    const outcome = await closeCurrentWaitingRoomQuietly();
    if (outcome === "playing" || outcome === "finished") {
      state.searching = false;
      return;
    }
    stopAll();
    state.roomId = null; state.room = null; state.symbol = null; state.isHost = false;
    const text = error.code === "permission-denied"
      ? "Firebase denied access. Check that Anonymous Authentication is enabled and your Firestore rules allow signed-in players to read and create rooms."
      : error.code === "failed-precondition"
      ? "Firebase rejected the request because of a database precondition. Check the browser console for the exact Firebase error."
      : error.code === "unavailable"
      ? "The game service is temporarily unreachable. Check your internet connection and try again."
      : (error.code === "auth/unavailable" || error.code === "unauthenticated")
      ? "The game couldn't establish a temporary player identity. Enable Firebase Anonymous Authentication and try again."
      : "Matchmaking couldn't connect to Firebase. Check the browser console for the exact error, then verify Authentication and Firestore setup.";
    await dialog({title:"Matchmaking unavailable",message:text,icon:"!",buttons:[{label:"Back to lobby",value:true,primary:true}]});
    goLobby();
  }
}
async function playCell(index) {
  const roomId = state.roomId;
  const user = state.user;
  if (!roomId || !user || !state.room || state.room.status !== "playing") return;
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, "rooms", roomId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("ROOM_GONE");
      const fresh = snap.data();
      const me = fresh.players?.X?.uid === user.uid ? "X"
        : fresh.players?.O?.uid === user.uid ? "O" : null;
      if (!me) throw new Error("NOT_PLAYER");
      if (fresh.status !== "playing") throw new Error("GAME_FINISHED");
      if (fresh.turn !== me) throw new Error("NOT_YOUR_TURN");
      if (fresh.board[index]) throw new Error("MOVE_TAKEN");
      const board = [...fresh.board];
      board[index] = me;
      const line = wins.find(combo => combo.every(i => board[i] === me)) || [];
      const winner = line.length ? me : board.every(Boolean) ? "draw" : null;
      tx.update(ref, {
        board, winner, winningLine:line,
        status:winner ? "finished" : "playing",
        turn:winner ? fresh.turn : me === "X" ? "O" : "X",
        updatedAt:serverTimestamp(), lastMoveAt:serverTimestamp()
      });
    });
  } catch(error) {
    if (error.message === "MOVE_TAKEN") toast("That square was just played. Try another.");
    else if (error.message === "NOT_YOUR_TURN") toast("It's the other player's turn.");
    else if (error.message === "NOT_PLAYER") toast("This device isn't assigned to a player in this room.");
    else if (error.message !== "ROOM_GONE" && error.message !== "GAME_FINISHED") {
      console.error("playCell", {code:error?.code, message:error?.message, error});
      if (error.code === "permission-denied") toast("Firebase rules rejected this move. Check the Firestore rules.");
    }
  }
}
function drawWinningLine(line) {
  const path = $("#win-line-path");
  const svg = $("#win-line");
  svg.classList.remove("drawn");
  path.setAttribute("d","");
  if (!line || line.length !== 3) return;
  const centers = line.map(index => ({x:(index%3)*100+50,y:Math.floor(index/3)*100+50}));
  path.setAttribute("d",`M ${centers[0].x} ${centers[0].y} L ${centers[2].x} ${centers[2].y}`);
  requestAnimationFrame(() => svg.classList.add("drawn"));
}
function renderGame(room) {
  const me = room.players?.X?.uid === state.user?.uid ? "X" : room.players?.O?.uid === state.user?.uid ? "O" : null;
  state.symbol = me;
  const myTurn = !!me && room.status === "playing" && room.turn === me;
  $("#game-room-label").textContent = room.mode === "private" ? "PRIVATE ROOM" : "QUICK MATCH";
  $("#game-status").textContent = room.status === "finished" ? "Round complete." : myTurn ? "Your turn." : `${room.players?.[room.turn]?.name || "Opponent"}’s turn.`;
  $("#game-substatus").textContent = room.status === "finished" ? "Nice game. See how the round went." : myTurn ? "Pick an empty square." : "Their move — hang tight.";
  $("#player-x-name").textContent = room.players?.X?.name || "Player X";
  $("#player-o-name").textContent = room.players?.O?.name || "Waiting…";
  $("#player-x").classList.toggle("active-player",room.status==="playing"&&room.turn==="X");
  $("#player-o").classList.toggle("active-player",room.status==="playing"&&room.turn==="O");
  $("#x-turn-tag").textContent = room.turn === "X" ? (me === "X" ? "YOUR TURN" : "THEIR TURN") : "";
  $("#o-turn-tag").textContent = room.turn === "O" ? (me === "O" ? "YOUR TURN" : "THEIR TURN") : "";
  $("#copy-game-code").classList.toggle("hidden",room.mode!=="private");
  $("#game-code-text").textContent = room.code || "";
  document.querySelectorAll(".cell").forEach((cell,i) => {
    const mark = room.board?.[i] || "";
    cell.replaceChildren();
    if (mark) {
      const glyph = document.createElement("span"); glyph.className = "mark-glyph"; glyph.textContent = mark === "X" ? "×" : "○"; cell.append(glyph);
    }
    cell.classList.toggle("mark-o",mark==="O");
    cell.classList.toggle("winning",room.winningLine?.includes(i));
    cell.disabled = room.status !== "playing" || !myTurn || !!mark;
    cell.setAttribute("aria-label",`Square ${i+1}${mark ? `, ${mark}` : ", empty"}`);
  });
  if (room.status === "finished" && room.winner !== "draw") drawWinningLine(room.winningLine);
  else { $("#win-line").classList.remove("drawn"); $("#win-line-path").setAttribute("d",""); }
  if (room.status === "playing") showScreen("game-screen");
}
function launchConfetti() {
  const field = $("#confetti-field"); field.replaceChildren();
  const colors = ["#315b3e","#d99a67","#c7d9bf","#e9c3a4","#a7b99e"];
  for (let i=0;i<25;i++) {
    const bit = document.createElement("i"); bit.className = "confetti-bit";
    bit.style.setProperty("--x",`${Math.random()*100}%`);
    bit.style.setProperty("--delay",`${Math.random()*.55}s`);
    bit.style.setProperty("--rotate",`${Math.random()*180}deg`);
    bit.style.setProperty("--confetti-color",colors[i%colors.length]);
    field.append(bit);
  }
  setTimeout(() => field.replaceChildren(),2400);
}
function renderResult(room) {
  if (state.finishedRoomId === state.roomId) return;
  state.finishedRoomId = state.roomId;
  showScreen("result-screen");
  $("#play-again").disabled = false;
  $("#play-again").textContent = "Rematch";
  const me = room.players?.X?.uid === state.user?.uid ? "X" : room.players?.O?.uid === state.user?.uid ? "O" : null;
  const winner = room.winner;
  const won = winner === me;
  $("#result-symbol").textContent = winner==="draw" ? "＝" : winner===me ? "×" : "○";
  $("#result-symbol").classList.toggle("draw",winner==="draw");
  $("#result-title").textContent = winner==="draw" ? "A fair draw." : won ? "Nicely played." : "Good game.";
  $("#result-description").textContent = winner==="draw" ? "Neither of you gave an inch. Fancy another?" : won ? "You found your line. Ready for another?" : `${room.players?.[winner]?.name || "Your opponent"} got this round. Rematch?`;
  $("#result-x-name").textContent = room.players?.X?.name || "Player X";
  $("#result-o-name").textContent = room.players?.O?.name || "Player O";
  $("#result-x-score").textContent = winner==="X" ? "WINNER" : winner==="draw" ? "DRAW" : "PLAYER X";
  $("#result-o-score").textContent = winner==="O" ? "WINNER" : winner==="draw" ? "DRAW" : "PLAYER O";
  if (won) launchConfetti();
}
async function requestRematch() {
  if (!state.roomId || !state.user || !state.room || state.room.status !== "finished") return;
  try {
    const ref = doc(db, "rooms", state.roomId);
    const result = await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("ROOM_GONE");
      const room = snap.data();
      const me = room.players?.X?.uid === state.user.uid ? "X" : room.players?.O?.uid === state.user.uid ? "O" : null;
      if (!me) throw new Error("NOT_PLAYER");
      if (room.status !== "finished") return {started: room.status === "playing"};
      const requests = {...(room.rematchRequests || {}), [me]: true};
      if (requests.X && requests.O) {
        tx.update(ref, {board:Array(9).fill(""), turn:"X", winner:null, winningLine:[], status:"playing",
          rematchRequests:{X:false,O:false}, updatedAt:serverTimestamp(), lastMoveAt:null});
        return {started:true};
      }
      tx.update(ref, {rematchRequests:requests, updatedAt:serverTimestamp()});
      return {started:false};
    });
    if (result.started) toast("Rematch starting!");
    else {
      state.rematchPending = true;
      toast("Rematch requested — waiting for the other player.");
      $("#play-again").textContent = "Waiting for opponent…";
      $("#play-again").disabled = true;
    }
  } catch(error) {
    console.error("rematch",error);
    toast("Couldn't start a rematch. Please try again.");
  }
}

async function leaveGame() {
  const yes = await dialog({title:"Leave this match?",message:"Leaving closes this room for both players. You can start a new match from the lobby.",icon:"!",buttons:[{label:"Stay here",value:false},{label:"Leave match",value:true,primary:true}]});
  if (!yes) return;
  state.searchSession++;
  state.searching = false;
  stopAll();
  if (state.roomId) { try { await updateDoc(doc(db,"rooms",state.roomId),{status:"closed",updatedAt:serverTimestamp()}); } catch(_) {} }
  state.roomId=null; state.room=null; state.symbol=null; state.isHost=false; state.finishedRoomId=null; goLobby();
}
function bindEvents() {
  $("#open-play").addEventListener("click",async () => {
    if (!state.username) {
      const saved = await profileDialog();
      if (!saved) return;
      const accepted = localStorage.getItem("ticTacToePrivacyAccepted") === "yes" || await privacyDialog();
      if (!accepted) return;
      localStorage.setItem("ticTacToePrivacyAccepted","yes");
    }
    goLobby();
  });
  $("#change-name").addEventListener("click",async () => { if (await profileDialog()) { goLobby(); toast("Name updated."); } });
  $("#quick-match").addEventListener("click",findQuickMatch);
  $("#create-room").addEventListener("click",async () => {
    const createSession = ++state.searchSession;
    state.searching = false;
    setWaiting("Preparing your room.", "Getting a private room ready to share.", "Creating room…", "private");
    try { await createRoom("private", createSession); }
    catch(error) {
      console.error(error);
      await dialog({title:"Couldn't create a room",message:serviceMessage(error),icon:"!",buttons:[{label:"Back to lobby",value:true,primary:true}]});
      goLobby();
    }
  });
  $("#join-form").addEventListener("submit",e => { e.preventDefault(); joinRoomByCode($("#room-code").value); });
  $("#cancel-wait").addEventListener("click",async () => {
    const isPrivate = (state.room?.mode || state.waitingMode) === "private";
    const yes = await dialog({title:isPrivate ? "Leave this private room?" : "Stop searching?",
      message:isPrivate ? "Your room will close and your friend won't be able to join it." : "You'll leave matchmaking and return to the lobby.",icon:"!",
      buttons:[{label:isPrivate ? "Stay in room" : "Keep searching",value:false},{label:isPrivate ? "Leave room" : "Back to lobby",value:true,primary:true}]});
    if (!yes) return;
    state.searchSession++;
    state.searching = false;
    stopWaitingClock(); stopRoomListener();
    if (state.roomId && state.isHost) { try { await updateDoc(doc(db,"rooms",state.roomId),{status:"closed",updatedAt:serverTimestamp()}); } catch(_) {} }
    state.roomId=null; state.room=null; state.symbol=null; state.isHost=false; state.waitingMode=null; goLobby();
  });
  $("#copy-code").addEventListener("click",async () => copyText($("#room-code-display").textContent,"Room code copied."));
  $("#copy-game-code").addEventListener("click",async () => copyText($("#game-code-text").textContent,"Room code copied."));
  document.querySelectorAll(".cell").forEach(cell => cell.addEventListener("click",() => playCell(Number(cell.dataset.cell))));
  $("#leave-game").addEventListener("click",leaveGame);
  $("#back-lobby").addEventListener("click",() => { state.searchSession++; state.searching=false; stopAll(); state.roomId=null; state.room=null; state.symbol=null; state.isHost=false; state.waitingMode=null; state.finishedRoomId=null; goLobby(); });
  $("#play-again").addEventListener("click",requestRematch);
  $("#dialog-close").addEventListener("click",() => closeDialog(false));
  $("#dialog-backdrop").addEventListener("click",e => { if (e.target === $("#dialog-backdrop") && !$("#dialog-close").classList.contains("hidden")) closeDialog(false); });
}
async function copyText(value, success) {
  try { await navigator.clipboard.writeText(value); toast(success); }
  catch(_) { toast(value); }
}
function serviceMessage(error) {
  if (error?.code === "permission-denied") return "The game service denied access. The site owner needs to check the Firestore rules.";
  if (error?.code === "unavailable") return "The game service is temporarily unreachable. Check your internet connection and try again.";
  if (error?.code === "failed-precondition") return "Firebase rejected this request. Check the browser console for the exact Firebase error.";
  if (error?.code === "auth/operation-not-allowed") return "Firebase Anonymous Authentication is disabled. Enable it in Firebase Console → Authentication → Sign-in method.";
  return "We couldn't connect to Firebase. Check the browser console for the exact error and verify Authentication, Firestore and database rules.";
}
async function runInitialFlow() {
  if (!introComplete || initialFlowStarted) return;
  initialFlowStarted = true;
  if (!state.username) {
    const saved = await profileDialog();
    if (!saved) return;
  }
  const accepted = localStorage.getItem("ticTacToePrivacyAccepted") === "yes" || await privacyDialog();
  if (accepted) {
    localStorage.setItem("ticTacToePrivacyAccepted", "yes");
    goLobby();
  }
}

function boot() {
  bindEvents();
  setTimeout(() => {
    $("#intro").remove();
    document.querySelector(".app-shell").classList.add("ready");
    introComplete = true;
    runInitialFlow();
  }, INTRO_MS);

  onAuthStateChanged(auth, async user => {
    if (user) {
      state.user = user;
      resolveAuthReady(user);
      runInitialFlow();
    } else {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("anonymous auth", error);
        resolveAuthReady(null);
        setTimeout(() => dialog({
          title:"Unable to connect",
          message:"The game needs Firebase Anonymous Authentication enabled by the site owner. Please try again later.",
          icon:"!",
          buttons:[{label:"Okay",value:true,primary:true}]
        }), INTRO_MS + 100);
      }
    }
  });
}
boot();
