/**
 * Tučňákův svět — Modulární jádro aplikace (5–7 let)
 * Architektura odděluje:
 *  1) Datovou vrstvu (JSON katalog aktivit + audio manifest)
 *  2) Audio & Karaoke engine (MP3 + Web Speech API + Web Audio SFX)
 *  3) Stavový automat tučňáka Pika (IDLE, SPEAKING, THINKING, HAPPY, ENCOURAGE, SLEEPY)
 *  4) Herní a kreslicí enginy (Zóna A, B, C, D)
 *  5) Rodičovskou zónu s 3s zámkem, časovačem a galerií
 */

(function () {
  "use strict";

  const STORAGE_KEY = "tucnakuv_svet_state_v1";

  /* =========================================================================
   * 1. ÚLOŽIŠTĚ POKROKU A NASTAVENÍ (LocalStorage)
   * ========================================================================= */
  class ProgressStore {
    constructor() {
      this.state = this.load();
    }

    defaultState() {
      return {
        starsEarned: {}, // { act_01_step_draw: 1, ... }
        zoneActivityTimeSec: {
          zone_a: 180,
          zone_b: 120,
          zone_c: 90,
          zone_d: 150,
          zone_e: 60
        },
        gallery: [], // [{ id, title, dataUrl, createdAt }]
        settings: {
          limitMinutes: 30,
          voiceVol: 0.9,
          sfxVol: 0.75,
          musicVol: 0.35
        }
      };
    }

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return this.defaultState();
        const parsed = JSON.parse(raw);
        return {
          ...this.defaultState(),
          ...parsed,
          settings: { ...this.defaultState().settings, ...(parsed.settings || {}) },
          zoneActivityTimeSec: {
            ...this.defaultState().zoneActivityTimeSec,
            ...(parsed.zoneActivityTimeSec || {})
          }
        };
      } catch (err) {
        return this.defaultState();
      }
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (err) {
        console.warn("Nepodařilo se uložit stav do localStorage:", err);
      }
    }

    recordSuccess(actId, zoneId, stars) {
      const prev = this.state.starsEarned[actId] || 0;
      if (stars > prev) {
        this.state.starsEarned[actId] = stars;
      }
      this.state.zoneActivityTimeSec[zoneId] = (this.state.zoneActivityTimeSec[zoneId] || 0) + 45;
      this.save();
    }

    addArtwork(title, dataUrl) {
      this.state.gallery.unshift({
        id: "art_" + Date.now(),
        title,
        dataUrl,
        createdAt: new Date().toLocaleString("cs-CZ")
      });
      if (this.state.gallery.length > 18) {
        this.state.gallery.length = 18;
      }
      this.save();
    }

    deleteArtwork(id) {
      this.state.gallery = this.state.gallery.filter((item) => item.id !== id);
      this.save();
    }
  }

  /* =========================================================================
   * 2. AUDIO & KARAOKE ENGINE
   * ========================================================================= */
  class AudioKaraokeEngine {
    constructor(manifest, store) {
      this.manifestMap = new Map();
      (manifest.entries || []).forEach((entry) => this.manifestMap.set(entry.id, entry));
      this.timingsMap = {};
      this.store = store;

      this.karaokeEl = document.getElementById("karaoke-text");
      this.currentAudio = null;
      this.karaokeTimer = null;
      this.speechGen = 0;
      this.lastSpoken = { id: "intro_welcome", overrideText: null };
      this.audioCtx = null;
      this.musicInterval = null;
      this.canLoadMp3 = window.location.protocol !== "file:";
      this.onSpeakStart = null;
      this.onSpeakEnd = null;

      if (this.canLoadMp3) {
        this.loadTimings();
      }
    }

    async loadTimings() {
      try {
        const res = await fetch("./assets/audio/timings.json");
        if (res.ok) {
          this.timingsMap = await res.json();
        }
      } catch (_err) {
        // Běží v režimu fallback Web Speech API
      }
    }

    ensureAudioCtx() {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          this.audioCtx = new Ctx();
        }
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    }

    playTone(freq, duration = 0.14, type = "sine", gainPeak = 0.18, delay = 0) {
      const vol = this.store.state.settings.sfxVol;
      if (vol <= 0.01) return;
      const ctx = this.ensureAudioCtx();
      if (!ctx) return;

      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(gainPeak * vol, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }

    playSfx(kind) {
      switch (kind) {
        case "pop":
          this.playTone(520, 0.1, "triangle", 0.2);
          break;
        case "snap":
          this.playTone(587, 0.1, "sine", 0.22, 0);
          this.playTone(880, 0.14, "sine", 0.22, 0.07);
          break;
        case "mix":
          this.playTone(440, 0.12, "triangle", 0.2, 0);
          this.playTone(554, 0.12, "triangle", 0.2, 0.09);
          this.playTone(659, 0.22, "sine", 0.24, 0.18);
          break;
        case "nudge":
          this.playTone(392, 0.14, "sine", 0.14, 0);
          this.playTone(349, 0.18, "sine", 0.14, 0.1);
          break;
        case "celebrate":
          [523, 659, 784, 1046].forEach((freq, idx) => {
            this.playTone(freq, 0.22, "triangle", 0.22, idx * 0.09);
          });
          break;
        case "count":
          this.playTone(660, 0.11, "sine", 0.18);
          break;
        default:
          this.playTone(480, 0.1, "sine", 0.15);
      }
    }

    startAmbientMusic() {
      if (this.musicInterval) return;
      const notes = [261.6, 329.6, 392.0, 329.6, 293.7, 349.2, 392.0, 523.3];
      let step = 0;
      this.musicInterval = setInterval(() => {
        const musicVol = this.store.state.settings.musicVol;
        if (musicVol <= 0.02 || document.hidden) return;
        const ctx = this.audioCtx;
        if (!ctx || ctx.state !== "running") return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(notes[step % notes.length], ctx.currentTime);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.035 * musicVol, ctx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.85);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.9);
        step += 1;
      }, 950);
    }

    stopCurrentSpeech() {
      this.speechGen += 1;
      if (this.karaokeTimer) {
        clearInterval(this.karaokeTimer);
        this.karaokeTimer = null;
      }
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }

    renderKaraokeWords(upperText) {
      const words = upperText.trim().split(/\s+/);
      this.karaokeEl.innerHTML = words
        .map((w, idx) => `<span class="karaoke-word" data-idx="${idx}">${w}</span>`)
        .join(" ");
      return Array.from(this.karaokeEl.querySelectorAll(".karaoke-word"));
    }

    highlightWord(wordSpans, index) {
      wordSpans.forEach((span, i) => {
        span.classList.toggle("active", i === index);
      });
    }

    speak(entryId, overrideText = null, options = {}) {
      const entry = this.manifestMap.get(entryId);
      const spokenText = overrideText || (entry ? entry.text_cs : entryId);
      const karaokeText = (overrideText || (entry ? entry.karaoke_text : spokenText)).toUpperCase();

      this.lastSpoken = { id: entryId, overrideText };
      this.stopCurrentSpeech();
      const gen = this.speechGen;

      const wordSpans = this.renderKaraokeWords(karaokeText);
      const voiceVol = this.store.state.settings.voiceVol;

      if (this.onSpeakStart) this.onSpeakStart(options.stateDuringSpeech || "SPEAKING");

      const finish = () => {
        if (gen !== this.speechGen) return;
        this.highlightWord(wordSpans, -1);
        if (this.karaokeTimer) {
          clearInterval(this.karaokeTimer);
          this.karaokeTimer = null;
        }
        if (this.onSpeakEnd) this.onSpeakEnd(options.stateAfterSpeech || "IDLE");
      };

      // Pokus o přehrání předgenerovaného MP3 souboru, pokud aplikace běží přes HTTP(S)
      if (!overrideText && entry && this.canLoadMp3 && voiceVol > 0.01) {
        const audio = new Audio("./" + entry.file);
        audio.volume = voiceVol;
        let fellBack = false;

        const runFallback = () => {
          if (fellBack) return;
          fellBack = true;
          this.speakViaWebSpeech(spokenText, wordSpans, voiceVol, finish);
        };

        audio.addEventListener("error", runFallback, { once: true });
        audio.addEventListener("ended", finish, { once: true });
        audio.addEventListener("play", () => {
          const timing = this.timingsMap[entryId];
          if (timing && Array.isArray(timing.words) && timing.words.length > 0) {
            this.karaokeTimer = setInterval(() => {
              const nowMs = audio.currentTime * 1000;
              const idx = timing.words.findIndex((w) => nowMs >= w.startMs && nowMs <= w.endMs + 120);
              if (idx >= 0) this.highlightWord(wordSpans, idx);
            }, 60);
          } else {
            this.runHeuristicKaraoke(wordSpans, Math.max(1600, (audio.duration || 3) * 1000));
          }
        });

        this.currentAudio = audio;
        audio.play().catch(runFallback);
        return;
      }

      this.speakViaWebSpeech(spokenText, wordSpans, voiceVol, finish);
    }

    speakViaWebSpeech(spokenText, wordSpans, voiceVol, onFinish) {
      const estimatedMs = Math.max(1500, spokenText.length * 68);
      if (!("speechSynthesis" in window) || voiceVol <= 0.01) {
        this.runHeuristicKaraoke(wordSpans, estimatedMs, onFinish);
        return;
      }

      const utter = new SpeechSynthesisUtterance(spokenText);
      utter.lang = "cs-CZ";
      utter.rate = 0.94;
      utter.pitch = 1.08;
      utter.volume = voiceVol;

      const voices = window.speechSynthesis.getVoices();
      const csVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("cs"));
      if (csVoice) utter.voice = csVoice;

      let boundaryFired = false;
      utter.onboundary = (ev) => {
        if (ev.name === "word" || typeof ev.charIndex === "number") {
          boundaryFired = true;
          const upTo = spokenText.slice(0, ev.charIndex).trim();
          const idx = upTo ? upTo.split(/\s+/).length : 0;
          this.highlightWord(wordSpans, Math.min(idx, wordSpans.length - 1));
        }
      };

      let finished = false;
      const safeFinish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(safetyTimeout);
        onFinish();
      };

      const safetyTimeout = setTimeout(safeFinish, estimatedMs + 1500);
      utter.onend = safeFinish;
      utter.onerror = safeFinish;

      this.runHeuristicKaraoke(wordSpans, estimatedMs, null, () => boundaryFired);

      try {
        window.speechSynthesis.speak(utter);
      } catch (_err) {
        this.runHeuristicKaraoke(wordSpans, estimatedMs, safeFinish);
      }
    }

    runHeuristicKaraoke(wordSpans, totalMs, onDone = null, shouldYield = null) {
      if (this.karaokeTimer) clearInterval(this.karaokeTimer);
      if (!wordSpans.length) {
        if (onDone) setTimeout(onDone, totalMs);
        return;
      }
      const stepMs = Math.max(190, totalMs / wordSpans.length);
      let idx = 0;
      this.highlightWord(wordSpans, 0);
      this.karaokeTimer = setInterval(() => {
        if (shouldYield && shouldYield()) return;
        idx += 1;
        if (idx >= wordSpans.length) {
          clearInterval(this.karaokeTimer);
          this.karaokeTimer = null;
          if (onDone) onDone();
        } else {
          this.highlightWord(wordSpans, idx);
        }
      }, stepMs);
    }

    repeatLast() {
      this.speak(this.lastSpoken.id, this.lastSpoken.overrideText);
    }
  }

  /* =========================================================================
   * 3. STAVOVÝ AUTOMAT TUČŇÁKA PIKA
   * ========================================================================= */
  class PenguinMascot {
    constructor(audioEngine) {
      this.audio = audioEngine;
      this.containerEl = document.getElementById("penguin-container");
      this.particlesEl = document.getElementById("penguin-particles");
      this.statePillEl = document.getElementById("penguin-state-pill");
      this.celebrationLayer = document.getElementById("celebration-layer");

      this.state = "IDLE";
      this.inactivityTimer = null;
      this.onHintTimeout = null;

      this.audio.onSpeakStart = (st) => this.setState(st || "SPEAKING");
      this.audio.onSpeakEnd = (st) => this.setState(st || "IDLE");
    }

    setState(nextState) {
      this.state = nextState;
      const classes = [
        "state-idle",
        "state-speaking",
        "state-thinking",
        "state-happy",
        "state-encourage",
        "state-sleepy"
      ];
      this.containerEl.classList.remove(...classes);
      this.containerEl.classList.add("state-" + nextState.toLowerCase());
      this.statePillEl.textContent = nextState;
    }

    emitParticles(emojis = ["⭐", "✨", "💙"]) {
      for (let i = 0; i < 7; i++) {
        const span = document.createElement("span");
        span.className = "particle-emoji";
        span.textContent = emojis[i % emojis.length];
        span.style.left = 20 + Math.random() * 70 + "%";
        span.style.top = 35 + Math.random() * 30 + "%";
        span.style.setProperty("--dx", (Math.random() * 90 - 45).toFixed(0) + "px");
        this.particlesEl.appendChild(span);
        setTimeout(() => span.remove(), 1350);
      }
    }

    launchConfetti() {
      const icons = ["⭐", "✨", "🎉", "🐟", "💙", "❄️"];
      for (let i = 0; i < 24; i++) {
        const item = document.createElement("span");
        item.className = "confetti-item";
        item.textContent = icons[i % icons.length];
        item.style.left = 5 + Math.random() * 90 + "vw";
        item.style.top = -10 - Math.random() * 30 + "px";
        item.style.animationDelay = (Math.random() * 0.45).toFixed(2) + "s";
        this.celebrationLayer.appendChild(item);
        setTimeout(() => item.remove(), 2200);
      }
    }

    celebrate(audioId = "celebrate_01", overrideText = null) {
      this.audio.playSfx("celebrate");
      this.emitParticles(["⭐", "✨", "🐟", "❤️"]);
      this.launchConfetti();
      this.audio.speak(audioId, overrideText, {
        stateDuringSpeech: "HAPPY",
        stateAfterSpeech: "IDLE"
      });
    }

    gentleNudge(audioId, overrideText = null, escalateToThinking = false) {
      this.audio.playSfx("nudge");
      this.audio.speak(audioId, overrideText, {
        stateDuringSpeech: escalateToThinking ? "THINKING" : "ENCOURAGE",
        stateAfterSpeech: escalateToThinking ? "THINKING" : "IDLE"
      });
    }

    resetInactivityTimer(hintCallback) {
      this.clearInactivityTimer();
      this.onHintTimeout = hintCallback;
      this.inactivityTimer = setTimeout(() => {
        if (this.state === "SLEEPY") return;
        this.setState("THINKING");
        if (this.onHintTimeout) {
          this.onHintTimeout();
        } else {
          this.audio.speak("hint_idle_encourage", null, {
            stateDuringSpeech: "THINKING",
            stateAfterSpeech: "IDLE"
          });
        }
      }, 15000);
    }

    clearInactivityTimer() {
      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = null;
      }
    }
  }

  /* =========================================================================
   * 4. HERNÍ ENGINE: ZÓNA A — KRESLENÍ KROK ZA KROKEM + MÍCHÁNÍ BAREV
   * ========================================================================= */
  class StepDrawActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.activity = activity;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;

      this.steps = level.config.steps || [];
      this.currentStepIdx = 0;
      this.coloringMode = false;
      this.activeColor = "#1D3557";
      this.brushSize = 11;
      this.mixSlots = [null, null];
      this.isDrawing = false;
      this.checkpoints = [];
      this.hitCount = 0;
      this.lastPt = null;

      this.render();
      this.prepareStep(0);
    }

    render() {
      const cfg = this.level.config;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">✏️ ${cfg.title}</h2>
          <div id="draw-step-pills" class="step-pills"></div>
          <div style="display:flex; gap:10px;">
            <button id="btn-draw-skip-step" class="btn-touch btn-secondary">✨ DALŠÍ KROK</button>
            <button id="btn-draw-save" class="btn-touch btn-primary hidden">💾 ULOŽIT OBRÁZEK</button>
          </div>
        </div>
        <div class="studio-layout">
          <div class="canvas-frame">
            <canvas id="step-draw-canvas" class="draw-canvas" width="${cfg.canvasWidth}" height="${cfg.canvasHeight}"></canvas>
          </div>
          <aside class="studio-sidebar">
            <div class="tool-box">
              <div class="tool-box-title">🖍️ BARVY PRO KRESLENÍ</div>
              <div id="draw-swatches" class="swatch-grid">
                ${[
                  { hex: "#1D3557", name: "TMAVĚ MODRÁ" },
                  { hex: "#E63946", name: "ČERVENÁ" },
                  { hex: "#FFD166", name: "ŽLUTÁ" },
                  { hex: "#118AB2", name: "MODRÁ" },
                  { hex: "#F77F00", name: "ORANŽOVÁ" },
                  { hex: "#06D6A0", name: "MÁTOVÁ" }
                ]
                  .map(
                    (c, i) =>
                      `<button class="btn-touch btn-swatch ${i === 0 ? "active" : ""}" data-color="${c.hex}" data-name="${c.name}" style="background:${c.hex}" aria-label="${c.name}"></button>`
                  )
                  .join("")}
              </div>
            </div>

            <div class="tool-box">
              <div class="tool-box-title">🧪 KOUZELNÉ MÍCHÁNÍ BAREV</div>
              <div class="mix-slots">
                <div id="mix-slot-1" class="mix-drop">1</div>
                <span class="mix-plus">+</span>
                <div id="mix-slot-2" class="mix-drop">2</div>
                <span class="mix-plus">=</span>
                <button id="mix-result-btn" class="btn-touch btn-swatch" style="background:#ffffff; border-color:#cbd5e1;" aria-label="Namíchaná barva">✨</button>
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn-touch btn-secondary mix-pick" data-mix="yellow" data-hex="#FFD166" style="background:#FFD166; min-width:64px;">ŽLUTÁ</button>
                <button class="btn-touch btn-secondary mix-pick" data-mix="blue" data-hex="#118AB2" style="background:#118AB2; color:#fff; min-width:64px;">MODRÁ</button>
                <button class="btn-touch btn-secondary mix-pick" data-mix="red" data-hex="#E63946" style="background:#E63946; color:#fff; min-width:64px;">ČERVENÁ</button>
              </div>
            </div>

            <div class="tool-box">
              <div class="tool-box-title">🧹 POMŮCKY</div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button id="btn-brush-thin" class="btn-touch btn-secondary">TENKÝ</button>
                <button id="btn-brush-thick" class="btn-touch btn-secondary">TLUSTÝ</button>
                <button id="btn-canvas-clear" class="btn-touch btn-secondary">ZNOVU</button>
              </div>
            </div>
          </aside>
        </div>
      `;

      this.canvas = document.getElementById("step-draw-canvas");
      this.ctx = this.canvas.getContext("2d");

      // Offscreen vrstva s vlastní kresbou dítěte
      this.paintLayer = document.createElement("canvas");
      this.paintLayer.width = cfg.canvasWidth;
      this.paintLayer.height = cfg.canvasHeight;
      this.paintCtx = this.paintLayer.getContext("2d");

      this.bindEvents();
    }

    bindEvents() {
      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        return {
          x: ((e.clientX - rect.left) / rect.width) * this.canvas.width,
          y: ((e.clientY - rect.top) / rect.height) * this.canvas.height
        };
      };

      this.canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.canvas.setPointerCapture(e.pointerId);
        this.isDrawing = true;
        this.lastPt = getPos(e);
        this.paintCtx.beginPath();
        this.paintCtx.arc(this.lastPt.x, this.lastPt.y, this.brushSize / 2, 0, Math.PI * 2);
        this.paintCtx.fillStyle = this.activeColor;
        this.paintCtx.fill();
        this.checkPointHit(this.lastPt);
        this.redraw();
        this.mascot.resetInactivityTimer(() => this.triggerHint());
      });

      this.canvas.addEventListener("pointermove", (e) => {
        if (!this.isDrawing) return;
        const pt = getPos(e);
        const mid = {
          x: (this.lastPt.x + pt.x) / 2,
          y: (this.lastPt.y + pt.y) / 2
        };
        this.paintCtx.beginPath();
        this.paintCtx.moveTo(this.lastPt.x, this.lastPt.y);
        this.paintCtx.quadraticCurveTo(this.lastPt.x, this.lastPt.y, mid.x, mid.y);
        this.paintCtx.strokeStyle = this.activeColor;
        this.paintCtx.lineWidth = this.brushSize;
        this.paintCtx.lineCap = "round";
        this.paintCtx.lineJoin = "round";
        this.paintCtx.stroke();

        this.lastPt = pt;
        this.checkPointHit(pt);
        this.redraw();
      });

      const endStroke = () => {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        this.evaluateStepProgress();
      };

      this.canvas.addEventListener("pointerup", endStroke);
      this.canvas.addEventListener("pointercancel", endStroke);

      // Barvy
      this.hostEl.querySelectorAll("#draw-swatches .btn-swatch").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.activeColor = btn.dataset.color;
          this.mascot.audio.playSfx("pop");
        });
      });

      // Kouzelné míchání barev
      this.hostEl.querySelectorAll(".mix-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handleColorMixPick(btn.dataset.mix, btn.dataset.hex);
        });
      });

      document.getElementById("btn-brush-thin").addEventListener("click", () => {
        this.brushSize = 8;
        this.mascot.audio.playSfx("pop");
      });
      document.getElementById("btn-brush-thick").addEventListener("click", () => {
        this.brushSize = 20;
        this.mascot.audio.playSfx("pop");
      });
      document.getElementById("btn-canvas-clear").addEventListener("click", () => {
        this.paintCtx.clearRect(0, 0, this.paintLayer.width, this.paintLayer.height);
        this.canvas.classList.remove("alive-bounce");
        this.coloringMode = false;
        document.getElementById("btn-draw-save").classList.add("hidden");
        document.getElementById("btn-draw-skip-step").classList.remove("hidden");
        this.prepareStep(0);
      });

      document.getElementById("btn-draw-skip-step").addEventListener("click", () => {
        this.completeCurrentStep();
      });

      document.getElementById("btn-draw-save").addEventListener("click", () => {
        const dataUrl = this.canvas.toDataURL("image/png");
        this.store.addArtwork(this.level.config.title, dataUrl);
        this.mascot.celebrate("celebrate_04");
        this.onComplete();
      });
    }

    handleColorMixPick(colorName, hex) {
      this.mascot.audio.playSfx("pop");
      const slot1 = document.getElementById("mix-slot-1");
      const slot2 = document.getElementById("mix-slot-2");
      const resBtn = document.getElementById("mix-result-btn");

      if (!this.mixSlots[0] || (this.mixSlots[0] && this.mixSlots[1])) {
        this.mixSlots = [{ name: colorName, hex }, null];
        slot1.style.background = hex;
        slot1.textContent = "";
        slot2.style.background = "#ffffff";
        slot2.textContent = "2";
        return;
      }

      this.mixSlots[1] = { name: colorName, hex };
      slot2.style.background = hex;
      slot2.textContent = "";

      const pair = [this.mixSlots[0].name, this.mixSlots[1].name].sort().join("+");
      let mixedHex = hex;
      let audioId = null;

      if (pair === "blue+yellow") {
        mixedHex = "#2A9D8F";
        audioId = "color_mix_yellow_blue";
      } else if (pair === "red+yellow") {
        mixedHex = "#F77F00";
        audioId = "color_mix_red_yellow";
      } else if (pair === "blue+red") {
        mixedHex = "#7209B7";
        audioId = "color_mix_red_blue";
      }

      resBtn.style.background = mixedHex;
      resBtn.textContent = "🎨";
      this.activeColor = mixedHex;
      this.brushSize = 18;
      this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
      resBtn.classList.add("active");
      this.mascot.audio.playSfx("mix");

      if (audioId) {
        this.mascot.emitParticles(["🎨", "✨", "🌈"]);
        this.mascot.audio.speak(audioId, null, {
          stateDuringSpeech: "HAPPY",
          stateAfterSpeech: "IDLE"
        });
      }
    }

    buildCheckpointsForStep(step) {
      const pts = [];
      if (step.type === "ellipse") {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
          pts.push({
            x: step.cx + Math.cos(a) * step.rx,
            y: step.cy + Math.sin(a) * step.ry,
            hit: false
          });
        }
      } else if (step.type === "circle") {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
          pts.push({
            x: step.cx + Math.cos(a) * step.r,
            y: step.cy + Math.sin(a) * step.r,
            hit: false
          });
        }
      } else if (step.paths) {
        step.paths.forEach((path) => {
          path.forEach(([x, y]) => pts.push({ x, y, hit: false }));
        });
      }
      return pts;
    }

    checkPointHit(pt) {
      if (this.coloringMode) return;
      for (const cp of this.checkpoints) {
        if (!cp.hit && Math.hypot(cp.x - pt.x, cp.y - pt.y) < 42) {
          cp.hit = true;
          this.hitCount += 1;
        }
      }
    }

    evaluateStepProgress() {
      if (this.coloringMode || !this.checkpoints.length) return;
      const ratio = this.hitCount / this.checkpoints.length;
      if (ratio >= 0.58) {
        this.completeCurrentStep();
      }
    }

    prepareStep(idx) {
      this.currentStepIdx = idx;
      const pillsEl = document.getElementById("draw-step-pills");
      pillsEl.innerHTML = this.steps
        .map((s, i) => {
          const cls = i < idx ? "done" : i === idx ? "current" : "";
          return `<span class="step-pill ${cls}">${i + 1}. ${s.label.split(" ")[0].toUpperCase()}</span>`;
        })
        .join("");

      const step = this.steps[idx];
      this.checkpoints = this.buildCheckpointsForStep(step);
      this.hitCount = 0;
      this.redraw();

      this.mascot.audio.speak(step.audioId || "act_01_intro");
      this.mascot.resetInactivityTimer(() => this.triggerHint());
    }

    completeCurrentStep() {
      if (this.coloringMode) return;
      this.mascot.audio.playSfx("snap");
      this.mascot.emitParticles(["✨", "⭐"]);

      if (this.currentStepIdx + 1 < this.steps.length) {
        this.prepareStep(this.currentStepIdx + 1);
      } else {
        // Dokončeno: oživení kresby + odemčení vybarvování
        this.coloringMode = true;
        this.currentStepIdx = this.steps.length;
        const pillsEl = document.getElementById("draw-step-pills");
        pillsEl.innerHTML = `<span class="step-pill done">✨ VYBARVI SI OBRÁZEK!</span>`;
        document.getElementById("btn-draw-skip-step").classList.add("hidden");
        document.getElementById("btn-draw-save").classList.remove("hidden");
        this.canvas.classList.add("alive-bounce");
        this.redraw();
        this.mascot.celebrate(this.level.successAudioId || "draw_step_alive");
        this.onComplete();
      }
    }

    triggerHint() {
      if (this.coloringMode) return;
      this.mascot.gentleNudge("hint_draw_trace", null, true);
    }

    drawStepShape(ctx, step, styleMode) {
      ctx.save();
      if (styleMode === "guide") {
        ctx.strokeStyle = "#4CC9F0";
        ctx.lineWidth = 6;
        ctx.setLineDash([14, 10]);
      } else if (styleMode === "locked") {
        ctx.strokeStyle = step.strokeColor || "#1D3557";
        ctx.lineWidth = 5;
        ctx.setLineDash([]);
      }

      if (step.type === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(step.cx, step.cy, step.rx, step.ry, 0, 0, Math.PI * 2);
        if (styleMode === "locked" && this.coloringMode) {
          ctx.fillStyle = (step.fillColor || "#EAF4F8") + "22";
          ctx.fill();
        }
        ctx.stroke();
      } else if (step.type === "circle") {
        ctx.beginPath();
        ctx.arc(step.cx, step.cy, step.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (step.paths) {
        step.paths.forEach((pts) => {
          if (pts.length === 2 && Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) < 12) {
            ctx.beginPath();
            ctx.arc(pts[0][0], pts[0][1], 7, 0, Math.PI * 2);
            ctx.fillStyle = step.strokeColor || "#1D3557";
            ctx.fill();
            return;
          }
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][0], pts[i][1]);
          }
          ctx.stroke();
        });
      }
      ctx.restore();
    }

    redraw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Jemný papír
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Hotové předchozí kroky
      for (let i = 0; i < Math.min(this.currentStepIdx, this.steps.length); i++) {
        this.drawStepShape(ctx, this.steps[i], "locked");
      }

      // Aktuální přerušovaná šablona
      if (!this.coloringMode && this.currentStepIdx < this.steps.length) {
        this.drawStepShape(ctx, this.steps[this.currentStepIdx], "guide");
      }

      // Kresba dítěte
      ctx.drawImage(this.paintLayer, 0, 0);
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 5. HERNÍ ENGINE: ZÓNA A BONUS — ZRCADLOVÉ KRESLENÍ (SYMETRIE)
   * ========================================================================= */
  class SymmetryDrawActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;

      this.autoMirror = level.config.autoMirror !== false;
      this.activeColor = "#FF5D8F";
      this.isDrawing = false;
      this.lastPt = null;
      this.strokesCount = 0;

      this.render();
      this.drawGuideBackdrop();
      this.mascot.audio.speak("act_03_intro");
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🦋 ${this.level.config.title}</h2>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="btn-sym-toggle" class="btn-touch btn-primary">🪞 ZRCADLENÍ: ${this.autoMirror ? "ZAP" : "VYP"}</button>
            <button id="btn-sym-clear" class="btn-touch btn-secondary">ZNOVU</button>
            <button id="btn-sym-done" class="btn-touch btn-primary">✨ HOTOVO A ULOŽIT</button>
          </div>
        </div>
        <div class="studio-layout">
          <div class="canvas-frame">
            <canvas id="sym-canvas" class="draw-canvas" width="760" height="460"></canvas>
          </div>
          <aside class="studio-sidebar">
            <div class="tool-box">
              <div class="tool-box-title">🎨 KOUZELNÉ BARVY</div>
              <div class="swatch-grid">
                ${["#FF5D8F", "#4CC9F0", "#FFB703", "#06D6A0", "#7209B7", "#1D3557"]
                  .map(
                    (hex, idx) =>
                      `<button class="btn-touch btn-swatch ${idx === 0 ? "active" : ""}" data-hex="${hex}" style="background:${hex}"></button>`
                  )
                  .join("")}
              </div>
            </div>
            <div class="tool-box">
              <div class="tool-box-title">💡 TIP OD PIKA</div>
              <p style="margin:0; font-weight:700; font-size:0.9rem; color:var(--navy-soft);">
                Kresli po pravé straně modré osy. Se zapnutým zrcadlením vznikne dokonalá mandala!
              </p>
            </div>
          </aside>
        </div>
      `;

      this.canvas = document.getElementById("sym-canvas");
      this.ctx = this.canvas.getContext("2d");

      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        return {
          x: ((e.clientX - rect.left) / rect.width) * this.canvas.width,
          y: ((e.clientY - rect.top) / rect.height) * this.canvas.height
        };
      };

      const drawSegment = (p1, p2) => {
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.strokeStyle = this.activeColor;
        this.ctx.lineWidth = 10;
        this.ctx.lineCap = "round";
        this.ctx.stroke();

        if (this.autoMirror) {
          const w = this.canvas.width;
          this.ctx.beginPath();
          this.ctx.moveTo(w - p1.x, p1.y);
          this.ctx.lineTo(w - p2.x, p2.y);
          this.ctx.stroke();
        }
      };

      this.canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.canvas.setPointerCapture(e.pointerId);
        this.isDrawing = true;
        this.lastPt = getPos(e);
        drawSegment(this.lastPt, { x: this.lastPt.x + 0.1, y: this.lastPt.y + 0.1 });
        this.strokesCount += 1;
      });

      this.canvas.addEventListener("pointermove", (e) => {
        if (!this.isDrawing) return;
        const pt = getPos(e);
        drawSegment(this.lastPt, pt);
        this.lastPt = pt;
      });

      this.canvas.addEventListener("pointerup", () => (this.isDrawing = false));

      this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => {
        b.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          this.activeColor = b.dataset.hex;
          this.mascot.audio.playSfx("pop");
        });
      });

      document.getElementById("btn-sym-toggle").addEventListener("click", (e) => {
        this.autoMirror = !this.autoMirror;
        e.currentTarget.textContent = `🪞 ZRCADLENÍ: ${this.autoMirror ? "ZAP" : "VYP"}`;
        this.mascot.audio.playSfx("pop");
      });

      document.getElementById("btn-sym-clear").addEventListener("click", () => {
        this.drawGuideBackdrop();
        this.mascot.audio.playSfx("pop");
      });

      document.getElementById("btn-sym-done").addEventListener("click", () => {
        this.store.addArtwork(this.level.config.title, this.canvas.toDataURL("image/png"));
        this.mascot.celebrate(this.level.successAudioId || "symmetry_done");
        this.onComplete();
      });
    }

    drawGuideBackdrop() {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const cx = w / 2;

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);

      // Osa souměrnosti
      ctx.save();
      ctx.strokeStyle = "#4CC9F0";
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(cx, 20);
      ctx.lineTo(cx, h - 20);
      ctx.stroke();

      // Levá předloha
      ctx.setLineDash([]);
      ctx.strokeStyle = "#1D3557";
      ctx.lineWidth = 6;
      const motif = this.level.config.motif;
      if (motif === "butterfly") {
        ctx.beginPath();
        ctx.ellipse(cx, 230, 14, 110, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 12, 175);
        ctx.bezierCurveTo(cx - 210, 40, cx - 260, 210, cx - 18, 235);
        ctx.bezierCurveTo(cx - 210, 270, cx - 180, 410, cx - 12, 310);
        ctx.stroke();
      } else if (motif === "snowflake") {
        for (let dy = -120; dy <= 120; dy += 60) {
          ctx.beginPath();
          ctx.moveTo(cx, 230 + dy);
          ctx.lineTo(cx - 160 + Math.abs(dy) * 0.5, 230 + dy - 40);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(cx, 330);
        ctx.lineTo(cx - 170, 330);
        ctx.lineTo(cx - 190, 130);
        ctx.lineTo(cx - 95, 220);
        ctx.lineTo(cx, 105);
        ctx.stroke();
      }
      ctx.restore();
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 6. HERNÍ ENGINE: ZÓNA B — STAVITEL Z TVARŮ (TANGRAM)
   * ========================================================================= */
  class TangramActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;

      this.pieces = (level.config.pieces || []).map((p) => ({
        ...p,
        curX: p.startX,
        curY: p.startY,
        curRot: p.startRot || 0,
        locked: false
      }));
      this.selectedId = this.pieces[0] ? this.pieces[0].id : null;
      this.mistakes = 0;
      this.hintSlotId = null;
      this.dragState = null;

      this.render();
      this.mascot.audio.speak("act_06_intro");
      this.mascot.resetInactivityTimer(() => this.triggerHint());
    }

    render() {
      const allowRot = this.level.config.allowRotation;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🔷 ${this.level.config.title}</h2>
          <div class="tangram-controls">
            <span class="step-pill current" id="tangram-progress">SLOŽENO: 0 / ${this.pieces.length}</span>
            ${
              allowRot
                ? `<button id="btn-tangram-rotate" class="btn-touch btn-primary">🔄 OTOČIT DÍLEK</button>`
                : ""
            }
          </div>
        </div>
        <div class="tangram-board-wrap">
          <svg id="tangram-svg" class="tangram-svg" viewBox="0 0 680 420" preserveAspectRatio="xMidYMid meet"></svg>
        </div>
      `;

      this.svg = document.getElementById("tangram-svg");
      if (allowRot) {
        document.getElementById("btn-tangram-rotate").addEventListener("click", () => {
          this.rotateSelectedPiece();
        });
      }

      this.drawBoard();
      this.bindSvgDrag();
    }

    shapePath(shape, size) {
      const h = size / 2;
      if (shape === "square") {
        return `M ${-h} ${-h} L ${h} ${-h} L ${h} ${h} L ${-h} ${h} Z`;
      }
      if (shape === "triangle") {
        return `M 0 ${-h} L ${h} ${h} L ${-h} ${h} Z`;
      }
      if (shape === "right_triangle") {
        return `M ${-h} ${-h} L ${h} ${h} L ${-h} ${h} Z`;
      }
      return "";
    }

    createShapeElement(piece, isTarget) {
      const ns = "http://www.w3.org/2000/svg";
      const g = document.createElementNS(ns, "g");
      const x = isTarget ? piece.targetX : piece.curX;
      const y = isTarget ? piece.targetY : piece.curY;
      const rot = isTarget ? piece.targetRot : piece.curRot;

      g.setAttribute("transform", `translate(${x}, ${y}) rotate(${rot})`);

      let el;
      if (piece.shape === "circle") {
        el = document.createElementNS(ns, "circle");
        el.setAttribute("cx", "0");
        el.setAttribute("cy", "0");
        el.setAttribute("r", String(piece.size / 2));
      } else {
        el = document.createElementNS(ns, "path");
        el.setAttribute("d", this.shapePath(piece.shape, piece.size));
      }

      if (isTarget) {
        el.setAttribute("fill", "#CFE8F7");
        el.setAttribute("stroke", "#4B86A8");
        el.setAttribute("stroke-width", "3");
        el.setAttribute("stroke-dasharray", "8 6");
        if (this.hintSlotId === piece.id) {
          g.classList.add("hint-halo");
          el.setAttribute("stroke", "#FFB703");
          el.setAttribute("stroke-width", "5");
        }
      } else {
        el.setAttribute("fill", piece.color);
        el.setAttribute("stroke", "#1D3557");
        el.setAttribute("stroke-width", "3.5");
        el.setAttribute("stroke-linejoin", "round");
        g.dataset.pieceId = piece.id;
        g.classList.add("tangram-piece");
        if (piece.locked) g.classList.add("locked");
        if (this.selectedId === piece.id && !piece.locked) g.classList.add("selected");
      }

      g.appendChild(el);
      return g;
    }

    drawBoard() {
      const ns = "http://www.w3.org/2000/svg";
      this.svg.innerHTML = "";

      // Oddělovač zásobníku dílků vpravo
      const tray = document.createElementNS(ns, "rect");
      tray.setAttribute("x", "425");
      tray.setAttribute("y", "16");
      tray.setAttribute("width", "240");
      tray.setAttribute("height", "388");
      tray.setAttribute("rx", "26");
      tray.setAttribute("fill", "#FFFFFF");
      tray.setAttribute("opacity", "0.78");
      tray.setAttribute("stroke", "#BCE0F5");
      tray.setAttribute("stroke-width", "3");
      this.svg.appendChild(tray);

      // Cílové stíny tvarů
      this.pieces.forEach((p) => {
        if (!p.locked) {
          this.svg.appendChild(this.createShapeElement(p, true));
        }
      });

      // Dílky (zamčené dole, aktivní nahoře)
      const ordered = [...this.pieces].sort((a, b) => Number(b.locked) - Number(a.locked));
      ordered.forEach((p) => {
        this.svg.appendChild(this.createShapeElement(p, false));
      });

      const doneCount = this.pieces.filter((p) => p.locked).length;
      const progEl = document.getElementById("tangram-progress");
      if (progEl) progEl.textContent = `SLOŽENO: ${doneCount} / ${this.pieces.length}`;
    }

    svgPoint(clientX, clientY) {
      const pt = this.svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = this.svg.getScreenCTM();
      return ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
    }

    bindSvgDrag() {
      this.svg.addEventListener("pointerdown", (e) => {
        const group = e.target.closest(".tangram-piece");
        if (!group) return;
        const piece = this.pieces.find((p) => p.id === group.dataset.pieceId);
        if (!piece || piece.locked) return;

        e.preventDefault();
        this.svg.setPointerCapture(e.pointerId);
        this.selectedId = piece.id;
        const p = this.svgPoint(e.clientX, e.clientY);
        this.dragState = {
          piece,
          offsetX: p.x - piece.curX,
          offsetY: p.y - piece.curY
        };
        this.mascot.audio.playSfx("pop");
        this.drawBoard();
        this.mascot.resetInactivityTimer(() => this.triggerHint());
      });

      this.svg.addEventListener("pointermove", (e) => {
        if (!this.dragState) return;
        const p = this.svgPoint(e.clientX, e.clientY);
        this.dragState.piece.curX = Math.max(40, Math.min(640, p.x - this.dragState.offsetX));
        this.dragState.piece.curY = Math.max(40, Math.min(385, p.y - this.dragState.offsetY));
        const activeGroup = this.svg.querySelector(`[data-piece-id="${this.dragState.piece.id}"]`);
        if (activeGroup) {
          activeGroup.setAttribute(
            "transform",
            `translate(${this.dragState.piece.curX}, ${this.dragState.piece.curY}) rotate(${this.dragState.piece.curRot})`
          );
          activeGroup.classList.add("dragging");
        }
      });

      const release = () => {
        if (!this.dragState) return;
        const piece = this.dragState.piece;
        this.dragState = null;
        this.evaluateDrop(piece);
      };

      this.svg.addEventListener("pointerup", release);
      this.svg.addEventListener("pointercancel", release);
    }

    rotationMatches(piece) {
      if (piece.shape === "circle" || piece.shape === "square") return true;
      return ((piece.curRot % 360) + 360) % 360 === ((piece.targetRot % 360) + 360) % 360;
    }

    evaluateDrop(piece) {
      const tol = this.level.config.snapTolerance || 32;
      const dist = Math.hypot(piece.curX - piece.targetX, piece.curY - piece.targetY);

      if (dist <= tol && this.rotationMatches(piece)) {
        // Magnetické přichycení
        piece.curX = piece.targetX;
        piece.curY = piece.targetY;
        piece.curRot = piece.targetRot;
        piece.locked = true;
        this.hintSlotId = null;
        this.mistakes = 0;
        this.mascot.audio.playSfx("snap");
        this.mascot.emitParticles(["✨", "⭐"]);
        this.drawBoard();

        if (this.pieces.every((p) => p.locked)) {
          this.mascot.clearInactivityTimer();
          this.mascot.celebrate(this.level.successAudioId || "celebrate_01");
          this.onComplete();
        }
        return;
      }

      // Pokud byl dílek puštěn na stavební ploše (vlevo od zásobníku), jemně vrátíme gumovým efektem
      if (piece.curX < 410) {
        this.mistakes += 1;
        const closePosButWrongRot = dist <= tol + 18 && !this.rotationMatches(piece);
        this.animateRubberBack(piece);

        if (this.mistakes >= 2) {
          this.hintSlotId = piece.id;
        }
        this.mascot.gentleNudge(
          closePosButWrongRot ? "hint_shape_rotate" : "hint_shape_corners",
          null,
          this.mistakes >= 2
        );
      }
      this.drawBoard();
    }

    animateRubberBack(piece) {
      const fromX = piece.curX;
      const fromY = piece.curY;
      const start = performance.now();
      const duration = 360;

      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        piece.curX = fromX + (piece.startX - fromX) * ease;
        piece.curY = fromY + (piece.startY - fromY) * ease;
        this.drawBoard();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    rotateSelectedPiece() {
      const piece = this.pieces.find((p) => p.id === this.selectedId && !p.locked);
      if (!piece) return;
      piece.curRot = (piece.curRot + 90) % 360;
      this.mascot.audio.playSfx("pop");
      this.drawBoard();
      this.mascot.resetInactivityTimer(() => this.triggerHint());
    }

    triggerHint() {
      const next = this.pieces.find((p) => !p.locked);
      if (!next) return;
      this.hintSlotId = next.id;
      this.drawBoard();
      this.mascot.gentleNudge("hint_shape_size", null, true);
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 7. HERNÍ ENGINE: ZÓNA C BONUS — PRVNÍ PÍSMENO
   * ========================================================================= */
  class FirstLetterActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.rounds = level.config.rounds || [];
      this.roundIdx = 0;
      this.mistakes = 0;
      this.renderRound();
    }

    renderRound() {
      const round = this.rounds[this.roundIdx];
      if (!round) return;

      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🔤 NA JAKÉ PÍSMENO TO ZAČÍNÁ?</h2>
          <span class="step-pill current">KOLO ${this.roundIdx + 1} / ${this.rounds.length}</span>
        </div>
        <div class="letter-stage">
          <div class="word-picture-card">
            <span class="word-emoji">${round.emoji}</span>
            <span class="word-display">${round.word}</span>
            <button id="btn-say-word" class="btn-touch btn-primary">🔊 POSLECHNOUT</button>
          </div>
          <div id="letter-choices" class="letter-choices">
            ${round.choices
              .map(
                (ch) =>
                  `<button class="btn-touch btn-letter-choice" data-letter="${ch}">${ch}</button>`
              )
              .join("")}
          </div>
        </div>
      `;

      document.getElementById("btn-say-word").addEventListener("click", () => {
        this.mascot.audio.speak(round.audioId || "act_10_intro");
      });

      this.hostEl.querySelectorAll(".btn-letter-choice").forEach((btn) => {
        btn.addEventListener("click", () => this.handleChoice(btn, round));
      });

      this.mascot.audio.speak(round.audioId || "act_10_intro");
      this.mascot.resetInactivityTimer(() => this.triggerHint(round));
    }

    handleChoice(btn, round) {
      const picked = btn.dataset.letter;
      if (picked === round.answer) {
        btn.classList.add("correct");
        this.mascot.audio.playSfx("snap");
        this.mascot.emitParticles(["⭐", "✨", "🔤"]);
        this.mistakes = 0;

        setTimeout(() => {
          if (this.roundIdx + 1 < this.rounds.length) {
            this.roundIdx += 1;
            this.renderRound();
          } else {
            this.mascot.clearInactivityTimer();
            this.mascot.celebrate(this.level.successAudioId || "celebrate_05");
            this.onComplete();
          }
        }, 700);
      } else {
        this.mistakes += 1;
        btn.classList.remove("gentle-nudge-anim");
        void btn.offsetWidth;
        btn.classList.add("gentle-nudge-anim");
        this.mascot.gentleNudge("hint_letter_listen", null, this.mistakes >= 2);
        if (this.mistakes >= 2) {
          this.triggerHint(round);
        }
      }
    }

    triggerHint(round) {
      const targetBtn = this.hostEl.querySelector(`[data-letter="${round.answer}"]`);
      if (targetBtn) targetBtn.classList.add("hint-halo");
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 8. HERNÍ ENGINE: ZÓNA D — KRMENÍ TUČŇÁKA (POČÍTÁNÍ RYBIČEK)
   * ========================================================================= */
  class FeedPenguinActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.rounds = level.config.rounds || [3, 5, 4];
      this.roundIdx = 0;
      this.bowlCount = 0;
      this.mistakes = 0;

      this.renderRound();
    }

    targetCount() {
      return this.rounds[this.roundIdx] || 3;
    }

    renderRound() {
      const target = this.targetCount();
      const pondTotal = this.level.config.pondCount || 10;
      this.bowlCount = 0;
      this.mistakes = 0;

      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🐟 NAKRM PIKA PŘESNĚ ${target} RYBIČKAMI!</h2>
          <span class="step-pill current">KOLO ${this.roundIdx + 1} / ${this.rounds.length}</span>
        </div>
        <div class="feed-layout">
          <section class="pond-panel">
            <div class="panel-heading">
              <span>🌊 ARKTICKÉ JEZÍRKO (ŤUKNI NA RYBIČKU)</span>
              <span>CÍL: ${target}</span>
            </div>
            <div id="fish-pond-grid" class="fish-pond-grid">
              ${Array.from({ length: pondTotal })
                .map((_, idx) => `<button class="btn-touch btn-fish" data-pond-idx="${idx}" aria-label="Rybička ${idx + 1}">🐟</button>`)
                .join("")}
            </div>
          </section>
          <section class="bowl-panel">
            <div class="panel-heading" style="width:100%;">
              <span>🥣 MISKA PRO PIKA</span>
              <span id="bowl-count-badge">0 / ${target}</span>
            </div>
            <div id="bowl-dropzone" class="bowl-dropzone" aria-label="Miska s rybičkami"></div>
            <div class="bowl-tally">
              <span>RYBIČEK V MISCE:</span>
              <span id="bowl-tally-num" style="color:var(--ocean-blue); font-size:1.7rem;">0</span>
            </div>
            <button id="btn-feed-submit" class="btn-touch btn-feed-submit">🍽️ NAKRMIT TUČŇÁKA</button>
          </section>
        </div>
      `;

      this.bindEvents();
      this.announceTarget(target);
    }

    announceTarget(target) {
      const askId = "feed_ask_" + String(target).padStart(2, "0");
      this.mascot.audio.speak(askId);
      this.mascot.resetInactivityTimer(() => {
        this.mascot.gentleNudge("hint_count_more", null, true);
      });
    }

    bindEvents() {
      const pondGrid = document.getElementById("fish-pond-grid");
      const bowlEl = document.getElementById("bowl-dropzone");

      pondGrid.addEventListener("click", (e) => {
        const fishBtn = e.target.closest(".btn-fish");
        if (!fishBtn || fishBtn.classList.contains("hidden")) return;
        fishBtn.classList.add("hidden");

        this.bowlCount += 1;
        const bowlFish = document.createElement("button");
        bowlFish.className = "btn-touch btn-fish";
        bowlFish.textContent = "🐟";
        bowlFish.dataset.fromPond = fishBtn.dataset.pondIdx;
        bowlEl.appendChild(bowlFish);

        this.updateBowlUI();
        this.speakNumber(this.bowlCount);
        this.mascot.resetInactivityTimer(() => {
          this.mascot.gentleNudge("hint_count_more", null, true);
        });
      });

      bowlEl.addEventListener("click", (e) => {
        const bowlFish = e.target.closest(".btn-fish");
        if (!bowlFish) return;
        const origin = pondGrid.querySelector(`[data-pond-idx="${bowlFish.dataset.fromPond}"]`);
        if (origin) origin.classList.remove("hidden");
        bowlFish.remove();
        this.bowlCount = Math.max(0, this.bowlCount - 1);
        this.mascot.audio.playSfx("pop");
        this.updateBowlUI();
      });

      document.getElementById("btn-feed-submit").addEventListener("click", () => {
        this.checkAnswer();
      });
    }

    speakNumber(n) {
      this.mascot.audio.playSfx("count");
      if (n >= 1 && n <= 20) {
        const id = "num_" + String(n).padStart(2, "0");
        this.mascot.audio.speak(id);
      }
    }

    updateBowlUI() {
      const target = this.targetCount();
      document.getElementById("bowl-count-badge").textContent = `${this.bowlCount} / ${target}`;
      document.getElementById("bowl-tally-num").textContent = String(this.bowlCount);
    }

    checkAnswer() {
      const target = this.targetCount();
      if (this.bowlCount === target) {
        this.mascot.audio.playSfx("snap");
        if (this.roundIdx + 1 < this.rounds.length) {
          this.mascot.emitParticles(["🐟", "⭐", "💙"]);
          this.mascot.audio.speak("feed_next_round");
          setTimeout(() => {
            this.roundIdx += 1;
            this.renderRound();
          }, 1800);
        } else {
          this.mascot.clearInactivityTimer();
          this.mascot.celebrate(this.level.successAudioId || "celebrate_03");
          this.onComplete();
        }
        return;
      }

      this.mistakes += 1;
      const bowl = document.getElementById("bowl-dropzone");
      bowl.classList.remove("gentle-nudge-anim");
      void bowl.offsetWidth;
      bowl.classList.add("gentle-nudge-anim");

      if (this.bowlCount < target) {
        this.mascot.gentleNudge("hint_count_more", null, this.mistakes >= 2);
      } else {
        this.mascot.gentleNudge("hint_count_too_many", null, this.mistakes >= 2);
      }
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 9. RODIČOVSKÁ ZÓNA & ČASOVÝ LIMIT (BEDTIME REŽIM)
   * ========================================================================= */
  class ParentalController {
    constructor(catalog, store, mascot, audio) {
      this.catalog = catalog;
      this.store = store;
      this.mascot = mascot;
      this.audio = audio;

      this.holdBtn = document.getElementById("btn-parent-gate");
      this.holdRing = document.getElementById("parent-hold-ring");
      this.gateModal = document.getElementById("modal-parent-gate");
      this.pzModal = document.getElementById("modal-parent-zone");
      this.bedtimeOverlay = document.getElementById("bedtime-overlay");

      this.holdTimer = null;
      this.holdProgressRaf = null;
      this.gateAnswer = 21;
      this.gateTyped = "";
      this.remainingSec = (this.store.state.settings.limitMinutes || 0) * 60;

      this.bindParentHold();
      this.bindMathGate();
      this.bindParentDashboard();
      this.startSessionTimer();
    }

    bindParentHold() {
      const HOLD_MS = 3000;
      const CIRCUMFERENCE = 176;
      let startAt = 0;

      const cancelHold = () => {
        clearTimeout(this.holdTimer);
        cancelAnimationFrame(this.holdProgressRaf);
        this.holdBtn.classList.remove("holding");
        this.holdRing.style.strokeDashoffset = String(CIRCUMFERENCE);
      };

      const startHold = (e) => {
        e.preventDefault();
        startAt = performance.now();
        this.holdBtn.classList.add("holding");

        const animateRing = (now) => {
          const pct = Math.min(1, (now - startAt) / HOLD_MS);
          this.holdRing.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - pct));
          if (pct < 1) {
            this.holdProgressRaf = requestAnimationFrame(animateRing);
          }
        };
        this.holdProgressRaf = requestAnimationFrame(animateRing);

        this.holdTimer = setTimeout(() => {
          cancelHold();
          this.openMathGate();
        }, HOLD_MS);
      };

      this.holdBtn.addEventListener("pointerdown", startHold);
      this.holdBtn.addEventListener("pointerup", cancelHold);
      this.holdBtn.addEventListener("pointerleave", cancelHold);
      this.holdBtn.addEventListener("pointercancel", cancelHold);
    }

    openMathGate() {
      const a = 11 + Math.floor(Math.random() * 8);
      const b = 4 + Math.floor(Math.random() * 6);
      this.gateAnswer = a + b;
      this.gateTyped = "";
      document.getElementById("gate-question").textContent = `${a} + ${b} = ?`;
      document.getElementById("gate-answer-display").textContent = "_";
      document.getElementById("gate-error-msg").classList.add("hidden");
      this.gateModal.classList.remove("hidden");
    }

    bindMathGate() {
      this.gateModal.querySelectorAll(".numpad-key").forEach((key) => {
        key.addEventListener("click", () => {
          const digit = key.dataset.digit;
          const action = key.dataset.action;
          if (digit !== undefined && this.gateTyped.length < 3) {
            this.gateTyped += digit;
          } else if (action === "clear") {
            this.gateTyped = this.gateTyped.slice(0, -1);
          } else if (action === "submit") {
            if (Number(this.gateTyped) === this.gateAnswer) {
              this.gateModal.classList.add("hidden");
              this.openDashboard();
            } else {
              document.getElementById("gate-error-msg").classList.remove("hidden");
              this.gateTyped = "";
            }
          }
          document.getElementById("gate-answer-display").textContent = this.gateTyped || "_";
        });
      });

      document.getElementById("btn-gate-cancel").addEventListener("click", () => {
        this.gateModal.classList.add("hidden");
      });
    }

    openDashboard() {
      this.renderProgressTab();
      this.renderGalleryTab();
      this.syncAudioSliders();
      this.syncLimitButtons();
      this.pzModal.classList.remove("hidden");
    }

    bindParentDashboard() {
      document.getElementById("btn-pz-close").addEventListener("click", () => {
        this.pzModal.classList.add("hidden");
      });

      this.pzModal.querySelectorAll(".pz-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          this.pzModal.querySelectorAll(".pz-tab").forEach((t) => t.classList.remove("active"));
          this.pzModal.querySelectorAll(".pz-tab-panel").forEach((p) => p.classList.remove("active"));
          tab.classList.add("active");
          document.getElementById("pz-tab-" + tab.dataset.tab).classList.add("active");
        });
      });

      // Časové limity
      this.pzModal.querySelectorAll(".btn-limit").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mins = Number(btn.dataset.minutes);
          this.store.state.settings.limitMinutes = mins;
          this.store.save();
          this.remainingSec = mins * 60;
          this.syncLimitButtons();
          this.updateTimerBadge();
        });
      });

      document.getElementById("btn-trigger-bedtime").addEventListener("click", () => {
        this.pzModal.classList.add("hidden");
        this.triggerBedtimeMode();
      });

      document.getElementById("btn-bedtime-parent-unlock").addEventListener("click", () => {
        this.bedtimeOverlay.classList.add("hidden");
        this.mascot.setState("IDLE");
        this.remainingSec = (this.store.state.settings.limitMinutes || 30) * 60;
        this.updateTimerBadge();
        this.audio.speak("intro_welcome");
      });

      // Hlasitost
      const bindSlider = (id, key, valId) => {
        const input = document.getElementById(id);
        input.addEventListener("input", () => {
          const pct = Number(input.value);
          this.store.state.settings[key] = pct / 100;
          document.getElementById(valId).textContent = `${pct} %`;
          this.store.save();
        });
      };
      bindSlider("vol-voice", "voiceVol", "vol-voice-val");
      bindSlider("vol-sfx", "sfxVol", "vol-sfx-val");
      bindSlider("vol-music", "musicVol", "vol-music-val");
    }

    syncLimitButtons() {
      const current = this.store.state.settings.limitMinutes;
      this.pzModal.querySelectorAll(".btn-limit").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.minutes) === current);
      });
    }

    syncAudioSliders() {
      const s = this.store.state.settings;
      const set = (id, valId, val) => {
        const pct = Math.round(val * 100);
        document.getElementById(id).value = String(pct);
        document.getElementById(valId).textContent = `${pct} %`;
      };
      set("vol-voice", "vol-voice-val", s.voiceVol);
      set("vol-sfx", "vol-sfx-val", s.sfxVol);
      set("vol-music", "vol-music-val", s.musicVol);
    }

    renderProgressTab() {
      const list = document.getElementById("pz-progress-list");
      const maxTime = Math.max(180, ...Object.values(this.store.state.zoneActivityTimeSec));

      list.innerHTML = this.catalog.zones
        .map((z) => {
          const sec = this.store.state.zoneActivityTimeSec[z.id] || 0;
          const mins = Math.max(1, Math.round(sec / 60));
          const pct = Math.min(100, Math.round((sec / maxTime) * 100));
          const zoneActs = this.catalog.activities.filter((a) => a.zoneId === z.id);
          const stars = zoneActs.reduce((acc, a) => acc + (this.store.state.starsEarned[a.id] || 0), 0);
          return `
            <div class="progress-row">
              <div class="progress-row-head">
                <span>${z.icon} ${z.title}</span>
                <span>⭐ ${stars} / ${zoneActs.length * 3} • cca ${mins} min hraní</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${pct}%; background:${z.accentColor};"></div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    renderGalleryTab() {
      const grid = document.getElementById("pz-gallery-grid");
      const items = this.store.state.gallery;
      if (!items.length) {
        grid.innerHTML = `<p style="font-weight:700; color:var(--navy-soft);">Zatím nejsou uložené žádné obrázky. Dokončete kresbu v Uměleckém ateliéru (Zóna A) a klikněte na „Uložit obrázek“.</p>`;
        return;
      }
      grid.innerHTML = items
        .map(
          (art) => `
          <div class="gallery-item">
            <img src="${art.dataUrl}" alt="${art.title}" />
            <div style="font-weight:900; font-size:0.9rem;">${art.title}</div>
            <div style="font-size:0.75rem; color:var(--navy-soft);">${art.createdAt}</div>
            <div style="display:flex; gap:8px;">
              <a class="btn-touch btn-primary" style="flex:1; text-decoration:none; font-size:0.85rem;" href="${art.dataUrl}" download="${art.id}.png">⬇️ ULOŽIT</a>
              <button class="btn-touch btn-secondary btn-del-art" data-art-id="${art.id}" style="min-width:64px;">🗑️</button>
            </div>
          </div>
        `
        )
        .join("");

      grid.querySelectorAll(".btn-del-art").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.store.deleteArtwork(btn.dataset.artId);
          this.renderGalleryTab();
        });
      });
    }

    startSessionTimer() {
      this.updateTimerBadge();
      setInterval(() => {
        if (this.store.state.settings.limitMinutes === 0) return;
        if (!this.bedtimeOverlay.classList.contains("hidden")) return;
        if (this.remainingSec > 0) {
          this.remainingSec -= 1;
          this.updateTimerBadge();
          if (this.remainingSec === 0) {
            this.triggerBedtimeMode();
          }
        }
      }, 1000);
    }

    updateTimerBadge() {
      const textEl = document.getElementById("session-timer-text");
      if (this.store.state.settings.limitMinutes === 0) {
        textEl.textContent = "∞";
        return;
      }
      const m = Math.floor(this.remainingSec / 60);
      const s = this.remainingSec % 60;
      textEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    triggerBedtimeMode() {
      this.mascot.clearInactivityTimer();
      this.mascot.setState("SLEEPY");
      this.bedtimeOverlay.classList.remove("hidden");
      this.audio.speak("bedtime_goodnight", null, {
        stateDuringSpeech: "SLEEPY",
        stateAfterSpeech: "SLEEPY"
      });
    }
  }

  /* =========================================================================
   * 10. HLAVNÍ APLIKAČNÍ KONTROLER (MAPA OSTROVŮ A NAVIGACE)
   * ========================================================================= */
  class PenguinWorldApp {
    constructor(catalog, manifest) {
      this.catalog = catalog;
      this.store = new ProgressStore();
      this.audio = new AudioKaraokeEngine(manifest, this.store);
      this.mascot = new PenguinMascot(this.audio);
      this.parental = new ParentalController(catalog, this.store, this.mascot, this.audio);

      this.currentActivity = null;
      this.currentLevelStars = 1;
      this.activeEngine = null;

      this.viewMap = document.getElementById("view-map");
      this.viewActivity = document.getElementById("view-activity");
      this.workspaceEl = document.getElementById("activity-workspace");
      this.zoneDrawer = document.getElementById("zone-drawer");
      this.btnHome = document.getElementById("btn-home");
      this.brandBadge = document.getElementById("brand-badge");
      this.levelStarsBar = document.getElementById("level-stars-bar");

      this.renderIslands();
      this.bindNavigation();

      // Odložení uvítací repliky na první interakci nebo okamžité zobrazení titulků
      this.audio.renderKaraokeWords(
        "AHOJ KAMARÁDE! JÁ JSEM TUČŇÁK PIKO. VYBER SI OSTROV A POJĎ SI HRÁT!"
      );
      document.addEventListener(
        "pointerdown",
        () => {
          this.audio.ensureAudioCtx();
          this.audio.startAmbientMusic();
        },
        { once: true }
      );
    }

    renderIslands() {
      const layer = document.getElementById("islands-layer");
      layer.innerHTML = this.catalog.zones
        .map((zone) => {
          const count = this.catalog.activities.filter((a) => a.zoneId === zone.id).length;
          return `
            <button
              class="island-card"
              data-zone-id="${zone.id}"
              style="left:${zone.position.x}%; top:${zone.position.y}%; background:${zone.themeColor};"
              aria-label="${zone.title}"
            >
              <span class="island-icon">${zone.icon}</span>
              <span class="island-title">${zone.title}</span>
              <span class="island-meta" style="background:${zone.accentColor};">${count} AKTIVIT</span>
            </button>
          `;
        })
        .join("");

      layer.querySelectorAll(".island-card").forEach((card) => {
        card.addEventListener("click", () => {
          this.openZoneDrawer(card.dataset.zoneId);
        });
      });
    }

    openZoneDrawer(zoneId) {
      const zone = this.catalog.zones.find((z) => z.id === zoneId);
      if (!zone) return;

      this.audio.playSfx("pop");
      this.audio.speak(zone.audioIntroId);

      document.getElementById("drawer-zone-icon").textContent = zone.icon;
      document.getElementById("drawer-zone-title").textContent = zone.title;
      document.getElementById("drawer-zone-subtitle").textContent = zone.subtitle;

      const listEl = document.getElementById("drawer-activities-list");
      const acts = this.catalog.activities.filter((a) => a.zoneId === zoneId);

      listEl.innerHTML = acts
        .map((act) => {
          const earned = this.store.state.starsEarned[act.id] || 0;
          const starBadge = earned ? `⭐ ${earned}/3` : "NOVÉ";
          return `
            <div class="activity-card-row ${act.implementedInPrototype ? "playable" : ""}">
              <div class="activity-row-info">
                <span class="activity-row-icon">${act.icon}</span>
                <div>
                  <div class="activity-row-title">${act.number}. ${act.title}</div>
                  <div class="activity-row-goal">${act.pedagogicalGoal}</div>
                </div>
              </div>
              <div class="activity-row-actions">
                ${
                  act.implementedInPrototype
                    ? `<button class="btn-touch btn-primary btn-launch-act" data-act-id="${act.id}">▶ HRÁT (${starBadge})</button>`
                    : `<button class="btn-touch btn-secondary btn-preview-act" data-act-id="${act.id}">🔊 UKÁZKA</button>`
                }
              </div>
            </div>
          `;
        })
        .join("");

      listEl.querySelectorAll(".btn-launch-act").forEach((btn) => {
        btn.addEventListener("click", () => this.launchActivity(btn.dataset.actId, 1));
      });

      listEl.querySelectorAll(".btn-preview-act").forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = this.catalog.activities.find((a) => a.id === btn.dataset.actId);
          if (act) {
            this.mascot.audio.playSfx("pop");
            this.mascot.audio.speak(act.audioIntroId);
          }
        });
      });

      this.zoneDrawer.classList.remove("hidden");
    }

    isFullscreenActive() {
      return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }

    toggleFullscreen() {
      this.audio.playSfx("pop");
      const docEl = document.documentElement;
      if (!this.isFullscreenActive()) {
        const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
        if (req) {
          Promise.resolve(req.call(docEl))
            .then(() => {
              if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock("landscape").catch(() => {});
              }
            })
            .catch(() => {});
        }
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
          Promise.resolve(exit.call(document)).catch(() => {});
        }
      }
    }

    updateFullscreenUI() {
      const btn = document.getElementById("btn-fullscreen");
      const icon = document.getElementById("fullscreen-icon");
      const label = document.getElementById("fullscreen-label");
      if (!btn || !icon || !label) return;
      const active = this.isFullscreenActive();
      btn.classList.toggle("active", active);
      icon.textContent = active ? "🗗" : "⛶";
      label.textContent = active ? "UKONČIT" : "CELÁ OBRAZOVKA";
    }

    bindNavigation() {
      const fsBtn = document.getElementById("btn-fullscreen");
      if (fsBtn) {
        fsBtn.addEventListener("click", () => this.toggleFullscreen());
      }
      document.addEventListener("fullscreenchange", () => this.updateFullscreenUI());
      document.addEventListener("webkitfullscreenchange", () => this.updateFullscreenUI());

      document.getElementById("btn-close-drawer").addEventListener("click", () => {
        this.zoneDrawer.classList.add("hidden");
      });

      this.btnHome.addEventListener("click", () => this.goToMap());

      document.getElementById("btn-repeat-audio").addEventListener("click", () => {
        this.audio.repeatLast();
      });

      document.getElementById("penguin-svg").addEventListener("click", () => {
        this.mascot.emitParticles(["💙", "❄️", "✨"]);
        this.audio.repeatLast();
      });

      document.querySelectorAll(".btn-quick").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.launchActivity(btn.dataset.act, 1);
        });
      });

      this.levelStarsBar.querySelectorAll(".btn-star-level").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!this.currentActivity) return;
          this.launchActivity(this.currentActivity.id, Number(btn.dataset.stars));
        });
      });
    }

    goToMap() {
      if (this.activeEngine && this.activeEngine.destroy) {
        this.activeEngine.destroy();
      }
      this.activeEngine = null;
      this.currentActivity = null;
      this.viewActivity.classList.add("hidden");
      this.viewMap.classList.remove("hidden");
      this.btnHome.classList.add("hidden");
      this.brandBadge.classList.remove("hidden");
      this.levelStarsBar.classList.add("hidden");
      document.querySelectorAll(".btn-quick").forEach((b) => b.classList.remove("active"));
      this.audio.speak("intro_map_select");
    }

    launchActivity(actId, stars = 1) {
      const activity = this.catalog.activities.find((a) => a.id === actId);
      if (!activity) return;

      if (this.activeEngine && this.activeEngine.destroy) {
        this.activeEngine.destroy();
      }

      this.currentActivity = activity;
      this.currentLevelStars = stars;
      const level = activity.levels.find((l) => l.stars === stars) || activity.levels[0];

      this.zoneDrawer.classList.add("hidden");
      this.viewMap.classList.add("hidden");
      this.viewActivity.classList.remove("hidden");
      this.btnHome.classList.remove("hidden");
      this.brandBadge.classList.add("hidden");
      this.levelStarsBar.classList.remove("hidden");

      this.levelStarsBar.querySelectorAll(".btn-star-level").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.stars) === stars);
      });
      document.querySelectorAll(".btn-quick").forEach((b) => {
        b.classList.toggle("active", b.dataset.act === actId);
      });

      const onComplete = () => {
        this.store.recordSuccess(activity.id, activity.zoneId, stars);
      };

      switch (activity.type) {
        case "step_draw":
          this.activeEngine = new StepDrawActivity(
            this.workspaceEl,
            activity,
            level,
            this.mascot,
            this.store,
            onComplete
          );
          break;
        case "symmetry_draw":
          this.activeEngine = new SymmetryDrawActivity(
            this.workspaceEl,
            activity,
            level,
            this.mascot,
            this.store,
            onComplete
          );
          break;
        case "tangram":
          this.activeEngine = new TangramActivity(
            this.workspaceEl,
            activity,
            level,
            this.mascot,
            this.store,
            onComplete
          );
          break;
        case "first_letter":
          this.activeEngine = new FirstLetterActivity(
            this.workspaceEl,
            activity,
            level,
            this.mascot,
            this.store,
            onComplete
          );
          break;
        case "feed_penguin":
          this.activeEngine = new FeedPenguinActivity(
            this.workspaceEl,
            activity,
            level,
            this.mascot,
            this.store,
            onComplete
          );
          break;
        default:
          this.workspaceEl.innerHTML = `<p>Aktivita ${activity.title} bude brzy doplněna.</p>`;
      }
    }
  }

  /* =========================================================================
   * 11. BOOTSTRAP APLIKACE A REGISTRACE SERVICE WORKERU
   * ========================================================================= */
  async function bootstrap() {
    let catalog = window.PENGUIN_WORLD_DATA.activitiesCatalog;
    let manifest = window.PENGUIN_WORLD_DATA.audioManifest;

    if (window.location.protocol !== "file:") {
      try {
        const [actRes, audRes] = await Promise.all([
          fetch("./data/activities.json"),
          fetch("./data/audio_manifest.json")
        ]);
        if (actRes.ok) catalog = await actRes.json();
        if (audRes.ok) manifest = await audRes.json();
      } catch (_err) {
        // Offline / lokální záloha z data-bundle.js
      }

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      }
    }

    window.penguinApp = new PenguinWorldApp(catalog, manifest);
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
