import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, updateDoc, runTransaction,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your Firebase project configuration
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

const $ = (selector) => document.querySelector(selector);
const screens = ["welcome-screen", "lobby-screen", "waiting-screen", "game-screen", "result-screen"];
const state = {
  user: null, username: localStorage.getItem("littleMatchName") || "",
  roomId: null, room: null, symbol: null, roomUnsub: null, searchUnsub: null,
  searchTimer: null, isHost: false, dialogResolve: null, toastTimer: null
};

function showScreen(id) {
  screens.forEach(screen => $("#" + screen).classList.toggle("hidden", screen !== id));
  $("#change-name").classList.toggle("hidden", id === "welcome-screen");
}
function showDialog({ title, message, confirmText = "Okay", cancelText = "", danger = false }) {
  $("#dialog-title").textContent = title;
  $("#dialog-message").textContent = message;
  $("#dialog-icon").textContent = danger ? "!" : "i";
  $("#dialog-icon").style.background = danger ? "#f8eadf" : "#e7efe2";
  $("#dialog-icon").style.color = danger ? "#a66d43" : "#315b3e";
  const actions = $("#dialog-actions");
  actions.replaceChildren();
  if (cancelText) {
    const cancel = document.createElement("button");
    cancel.className = "button button-quiet"; cancel.textContent = cancelText;
    cancel.addEventListener("click", () => closeDialog(false));
    actions.append(cancel);
  }
  const confirm = document.createElement("button");
  confirm.className = "button " + (danger ? "button-dark" : "button-primary");
  confirm.textContent = confirmText;
  confirm.addEventListener("click", () => closeDialog(true));
  actions.append(confirm);
  $("#dialog-backdrop").classList.remove("hidden");
  return new Promise(resolve => { state.dialogResolve = resolve; confirm.focus(); });
}
function closeDialog(value) {
  $("#dialog-backdrop").classList.add("hidden");
  if (state.dialogResolve) state.dialogResolve(value);
  state.dialogResolve = null;
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("visible");
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove("visible"), 2300);
}
function cleanName(value) { return value.trim().replace(/\s+/g, " ").slice(0, 18); }
function goLobby() {
  $("#hello-name").textContent = state.username;
  $("#avatar").textContent = state.username.charAt(0).toUpperCase() || "?";
  showScreen("lobby-screen");
}
function stopListeners() {
  if (state.roomUnsub) state.roomUnsub();
  if (state.searchUnsub) state.searchUnsub();
  if (state.searchTimer) clearTimeout(state.searchTimer);
  state.roomUnsub = state.searchUnsub = state.searchTimer = null;
}
function setWaiting(title, description, status) {
  $("#waiting-title").innerHTML = title;
  $("#waiting-description").textContent = description;
  $("#waiting-status-text").textContent = status;
  $("#room-code-block").classList.add("hidden");
  showScreen("waiting-screen");
}
function watchRoom(roomId) {
  if (state.roomUnsub) state.roomUnsub();
  state.roomId = roomId;
  state.roomUnsub = onSnapshot(doc(db, "rooms", roomId), snap => {
    if (!snap.exists()) {
      stopListeners();
      showDialog({ title: "Room closed", message: "This game room is no longer available.", confirmText: "Back to lobby" }).then(goLobby);
      return;
    }
    const room = snap.data();
    state.room = room;
    if (room.status === "playing" || room.status === "finished") {
      state.symbol = room.players?.X?.uid === state.user.uid ? "X" : "O";
      renderGame(room);
      if (room.status === "finished") renderResult(room);
    } else {
      showScreen("waiting-screen");
      $("#waiting-eyebrow").textContent = "Room created";
      $("#waiting-title").innerHTML = "Your room is<br>ready to go.";
      $("#waiting-description").textContent = "Share the code with a friend. Their seat is waiting.";
      $("#room-code-block").classList.remove("hidden");
      $("#room-code-display").textContent = room.code;
      $("#waiting-status-text").textContent = "Waiting for the other player";
    }
  }, error => {
    console.error(error);
    showDialog({ title: "Connection hiccup", message: "We couldn't keep this room updated. Check your Firebase setup and internet connection.", confirmText: "Back to lobby" }).then(goLobby);
  });
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
async function createPrivateRoom() {
  try {
    stopListeners();
    const roomRef = doc(collection(db, "rooms"));
    const code = makeCode();
    await setDoc(roomRef, {
      code, status: "waiting", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      players: { X: { uid: state.user.uid, name: state.username }, O: null },
      board: Array(9).fill(""), turn: "X", winner: null, winningLine: [], lastMoveAt: null,
      mode: "private"
    });
    state.isHost = true; state.symbol = "X";
    watchRoom(roomRef.id);
  } catch (error) { console.error(error); showDialog({ title: "Couldn't create a room", message: "Please check your Firestore setup and security rules, then try again." }); }
}
async function joinRoomByCode(rawCode) {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    await showDialog({ title: "Check that code", message: "Room codes are six letters or numbers. Give it another look." }); return;
  }
  try {
    const q = query(collection(db, "rooms"), where("code", "==", code), where("status", "==", "waiting"), limit(1));
    const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const found = await getDocs(q);
    if (found.empty) { await showDialog({ title: "Room not found", message: "That code may be wrong, or the room has already started. Ask your friend for a fresh code." }); return; }
    const roomDoc = found.docs[0];
    await runTransaction(db, async tx => {
      const snap = await tx.get(roomDoc.ref);
      if (!snap.exists() || snap.data().status !== "waiting" || snap.data().players.O) throw new Error("ROOM_FULL");
      const room = snap.data();
      if (room.players.X.uid === state.user.uid) throw new Error("SAME_PLAYER");
      tx.update(roomDoc.ref, {
        "players.O": { uid: state.user.uid, name: state.username },
        status: "playing", updatedAt: serverTimestamp()
      });
    });
    state.isHost = false; state.symbol = "O";
    watchRoom(roomDoc.id);
  } catch (error) {
    console.error(error);
    const message = error.message === "ROOM_FULL" ? "Someone has already joined this room." :
      error.message === "SAME_PLAYER" ? "You can't join your own room from the same browser session." :
      "We couldn't join that room. Check your connection and try again.";
    showDialog({ title: "Couldn't join", message });
  }
}
async function quickMatch() {
  setWaiting("Looking for<br>your next rival.", "Hang tight. We’ll pair you as soon as someone’s ready.", "Searching for an open game");
  try {
    const q = query(collection(db, "rooms"), where("status", "==", "waiting"), where("mode", "==", "quick"), orderBy("createdAt", "asc"), limit(10));
    const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const waitingRooms = await getDocs(q);
    for (const candidate of waitingRooms.docs) {
      if (candidate.data().players?.X?.uid === state.user.uid) continue;
      try {
        await runTransaction(db, async tx => {
          const snap = await tx.get(candidate.ref);
          if (!snap.exists()) throw new Error("TAKEN");
          const room = snap.data();
          if (room.status !== "waiting" || room.players?.O) throw new Error("TAKEN");
          tx.update(candidate.ref, {
            "players.O": { uid: state.user.uid, name: state.username },
            status: "playing", updatedAt: serverTimestamp()
          });
        });
        state.isHost = false; state.symbol = "O"; watchRoom(candidate.id); return;
      } catch (e) { if (e.message !== "TAKEN") throw e; }
    }
    const roomRef = doc(collection(db, "rooms"));
    await setDoc(roomRef, {
      code: makeCode(), status: "waiting", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      players: { X: { uid: state.user.uid, name: state.username }, O: null },
      board: Array(9).fill(""), turn: "X", winner: null, winningLine: [], lastMoveAt: null, mode: "quick"
    });
    state.isHost = true; state.symbol = "X"; watchRoom(roomRef.id);
    $("#waiting-eyebrow").textContent = "Quick match";
    $("#waiting-title").innerHTML = "You’re first<br>in the room.";
    $("#waiting-description").textContent = "We’ll keep the board ready while another player joins.";
    $("#waiting-status-text").textContent = "Waiting for another player";
    state.searchTimer = setTimeout(() => {
      if (state.room?.status === "waiting") toast("Still looking — keep this screen open.");
    }, 12000);
  } catch (error) {
    console.error(error);
    showDialog({ title: "Matchmaking paused", message: "We couldn't find a match right now. Please check your Firebase setup and try again." }).then(goLobby);
  }
}
const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
async function playCell(index) {
  const room = state.room;
  if (!room || room.status !== "playing" || room.turn !== state.symbol || room.board[index]) return;
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, "rooms", state.roomId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("ROOM_GONE");
      const fresh = snap.data();
      if (fresh.status !== "playing" || fresh.turn !== state.symbol || fresh.board[index]) throw new Error("MOVE_TAKEN");
      const board = [...fresh.board]; board[index] = state.symbol;
      const line = wins.find(combo => combo.every(i => board[i] === state.symbol)) || [];
      const winner = line.length ? state.symbol : board.every(Boolean) ? "draw" : null;
      tx.update(ref, {
        board, winner, winningLine: line, status: winner ? "finished" : "playing",
        turn: winner ? fresh.turn : (state.symbol === "X" ? "O" : "X"),
        updatedAt: serverTimestamp(), lastMoveAt: serverTimestamp()
      });
    });
  } catch (error) {
    if (error.message === "MOVE_TAKEN") toast("That square has already been played.");
    else console.error(error);
  }
}
function renderGame(room) {
  const me = state.symbol;
  const opponent = me === "X" ? "O" : "X";
  const myTurn = room.status === "playing" && room.turn === me;
  $("#game-room-label").textContent = room.mode === "private" ? "PRIVATE ROOM" : "QUICK MATCH";
  $("#game-status").textContent = room.status === "finished" ? "Round complete." : myTurn ? "Your turn." : `${room.players?.[room.turn]?.name || "Opponent"}’s turn.`;
  $("#game-substatus").textContent = room.status === "finished" ? "Nice game. Fancy another?" : myTurn ? "Pick an empty square." : "Their move — hang tight.";
  $("#player-x-name").textContent = room.players?.X?.name || "Player X";
  $("#player-o-name").textContent = room.players?.O?.name || "Waiting…";
  $("#player-x").classList.toggle("active-player", room.status === "playing" && room.turn === "X");
  $("#player-o").classList.toggle("active-player", room.status === "playing" && room.turn === "O");
  $("#x-turn-tag").textContent = room.turn === "X" ? "THEIR TURN" : "";
  $("#o-turn-tag").textContent = room.turn === "O" ? "THEIR TURN" : "";
  $("#copy-game-code").classList.toggle("hidden", room.mode !== "private");
  $("#game-code-text").textContent = room.code || "";
  document.querySelectorAll(".cell").forEach((cell, i) => {
    const mark = room.board?.[i] || "";
    cell.textContent = mark === "X" ? "×" : mark === "O" ? "○" : "";
    cell.classList.toggle("mark-o", mark === "O");
    cell.classList.toggle("winning", room.winningLine?.includes(i));
    cell.disabled = room.status !== "playing" || !myTurn || !!mark;
    cell.setAttribute("aria-label", `Square ${i + 1}${mark ? `, ${mark}` : ", empty"}`);
  });
  if (room.status === "playing") showScreen("game-screen");
}
function renderResult(room) {
  showScreen("result-screen");
  const me = state.symbol;
  const winner = room.winner;
  const won = winner === me;
  $("#result-symbol").textContent = winner === "draw" ? "＝" : winner === me ? "×" : "○";
  $("#result-symbol").classList.toggle("draw", winner === "draw");
  $("#result-title").textContent = winner === "draw" ? "A fair draw." : won ? "Nicely played." : "Good game.";
  $("#result-description").textContent = winner === "draw" ? "No winner this time. One more round?" : won ? "You found your line. Ready for another?" : `${room.players?.[winner]?.name || "Your opponent"} got this one. Rematch?`;
  $("#result-x-name").textContent = room.players?.X?.name || "Player X";
  $("#result-o-name").textContent = room.players?.O?.name || "Player O";
  $("#result-x-score").textContent = winner === "X" ? "WINNER" : winner === "draw" ? "DRAW" : "PLAYER X";
  $("#result-o-score").textContent = winner === "O" ? "WINNER" : winner === "draw" ? "DRAW" : "PLAYER O";
}
async function leaveCurrentGame() {
  const confirmed = await showDialog({ title: "Leave this game?", message: "Your opponent may see the room close. You can always start a new match from the lobby.", confirmText: "Leave game", cancelText: "Stay", danger: true });
  if (!confirmed) return;
  stopListeners();
  if (state.roomId) {
    try {
      const ref = doc(db, "rooms", state.roomId);
      await updateDoc(ref, { status: "closed", updatedAt: serverTimestamp() });
    } catch (_) {}
  }
  state.roomId = null; state.room = null; goLobby();
}
async function rematch() {
  // Each rematch is a new room; this keeps the old result stable for both players.
  await createPrivateRoom();
}
function bindEvents() {
  $("#name-form").addEventListener("submit", event => {
    event.preventDefault();
    const name = cleanName($("#username").value);
    if (name.length < 2) { showDialog({ title: "A tiny bit longer", message: "Use at least two characters for your player name." }); return; }
    state.username = name; localStorage.setItem("littleMatchName", name); goLobby();
  });
  $("#change-name").addEventListener("click", async () => {
    const value = await showDialog({ title: "Change your name", message: "This updates the name used in your next match. Current games keep their original player name.", confirmText: "Save name", cancelText: "Cancel" });
    if (!value) return;
    const newName = await customNamePrompt();
    if (newName) { state.username = newName; localStorage.setItem("littleMatchName", newName); goLobby(); }
  });
  $("#quick-match").addEventListener("click", quickMatch);
  $("#create-room").addEventListener("click", createPrivateRoom);
  $("#join-form").addEventListener("submit", e => { e.preventDefault(); joinRoomByCode($("#room-code").value); });
  $("#cancel-wait").addEventListener("click", async () => {
    const yes = await showDialog({ title: "Head back?", message: "You'll leave this search or room and return to the lobby.", confirmText: "Back to lobby", cancelText: "Keep waiting" });
    if (!yes) return;
    stopListeners();
    if (state.roomId && state.isHost) { try { await updateDoc(doc(db, "rooms", state.roomId), { status: "closed", updatedAt: serverTimestamp() }); } catch (_) {} }
    state.roomId = null; state.room = null; goLobby();
  });
  $("#copy-code").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#room-code-display").textContent); toast("Room code copied."); }
    catch (_) { toast("Code: " + $("#room-code-display").textContent); }
  });
  $("#copy-game-code").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#game-code-text").textContent); toast("Room code copied."); } catch (_) { toast("Room code: " + $("#game-code-text").textContent); }
  });
  document.querySelectorAll(".cell").forEach(cell => cell.addEventListener("click", () => playCell(Number(cell.dataset.cell))));
  $("#leave-game").addEventListener("click", leaveCurrentGame);
  $("#back-lobby").addEventListener("click", () => { state.roomId = null; state.room = null; stopListeners(); goLobby(); });
  $("#play-again").addEventListener("click", async () => {
    const yes = await showDialog({ title: "Another round?", message: "We'll start a fresh room for your next game.", confirmText: "Let's go", cancelText: "Not now" });
    if (yes) { state.roomId = null; state.room = null; stopListeners(); goLobby(); }
  });
  $("#dialog-backdrop").addEventListener("click", e => { if (e.target === $("#dialog-backdrop")) closeDialog(false); });
  $("#username").value = state.username;
}
function customNamePrompt() {
  return new Promise(resolve => {
    const message = $("#dialog-message");
    const original = message.textContent;
    message.innerHTML = "";
    const input = document.createElement("input");
    input.maxLength = 18; input.value = state.username; input.placeholder = "Your name"; input.style.width = "100%";
    message.append(input); input.focus();
    const actions = $("#dialog-actions"); actions.replaceChildren();
    const cancel = document.createElement("button"); cancel.className = "button button-quiet"; cancel.textContent = "Cancel";
    const save = document.createElement("button"); save.className = "button button-primary"; save.textContent = "Save";
    cancel.onclick = () => { closeDialog(false); message.textContent = original; resolve(null); };
    save.onclick = () => { const name = cleanName(input.value); if (name.length < 2) { toast("Use at least two characters."); return; } closeDialog(true); message.textContent = original; resolve(name); };
    actions.append(cancel, save);
    $("#dialog-title").textContent = "Change your name";
    $("#dialog-icon").textContent = "✎";
    $("#dialog-backdrop").classList.remove("hidden");
  });
}

bindEvents();
onAuthStateChanged(auth, async user => {
  if (user) { state.user = user; if (state.username) goLobby(); }
  else {
    try { await signInAnonymously(auth); }
    catch (error) {
      console.error(error);
      showDialog({ title: "Almost ready", message: "Enable Anonymous sign-in in Firebase Authentication, then reload this page.", confirmText: "Okay" });
    }
  }
});
