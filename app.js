/* RSU COBO — logica dell'app.
   I contenuti stanno nei file della cartella "dati": qui non serve modificare nulla per aggiornarli. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- testo: paragrafi, elenchi con "- ", **grassetto**, link https ---------- */
  const linkify = s => s.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  const inline = s => linkify(esc(s)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  function rich(text) {
    const blocks = String(text || "").replace(/\r/g, "").split(/\n\s*\n/);
    return blocks.map(b => {
      const ls = b.split("\n").map(l => l.trim()).filter(Boolean);
      if (!ls.length) return "";
      let out = "", para = [], list = [];
      const flushP = () => { if (para.length) { out += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
      const flushL = () => { if (list.length) { out += `<ul>${list.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`; list = []; } };
      ls.forEach(l => {
        if (/^#{2,}\s+/.test(l)) { flushP(); flushL(); out += `<p><strong>${inline(l.replace(/^#+\s+/, ""))}</strong></p>`; }
        else if (/^[-•*]\s+/.test(l)) { flushP(); list.push(l.replace(/^[-•*]\s+/, "")); }
        else { flushL(); para.push(l); }
      });
      flushP(); flushL();
      return out;
    }).join("");
  }

  /* ---------- date: accetta 25/10/2026, 25-10-26 oppure 2026-10-25 ---------- */
  const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  function toISO(s) {
    s = String(s || "").trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(s);
    if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    return "";
  }
  const parseISO = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  function fmtDate(s) {
    const d = parseISO(s); if (!d) return "";
    const diff = Math.round((startOfDay(new Date()) - d) / 864e5);
    if (diff === 0) return "Oggi";
    if (diff === 1) return "Ieri";
    return `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
  }
  const daysAgo = s => { const d = parseISO(s); return d ? Math.round((startOfDay(new Date()) - d) / 864e5) : Infinity; };

  /* ---------- lettura dei file Markdown ----------
     Ogni voce inizia con "# Titolo" (o "## Nome" nei contatti).
     Subito sotto, righe "chiave: valore" (data, tipo, stato...). Poi il testo libero. */
  const normKey = k => String(k).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const clean = txt => String(txt || "").replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "");
  function blocks(txt, level) {
    const re = new RegExp(`^#{${level}}\\s+(.+?)\\s*#*\\s*$`), out = []; let cur = null;
    txt.split("\n").forEach(line => {
      const m = re.exec(line);
      if (m && !line.startsWith("#".repeat(level + 1))) { cur = { titolo: m[1].trim(), lines: [] }; out.push(cur); }
      else if (cur) cur.lines.push(line);
    });
    return out;
  }
  const MULTI = ["allegato"];
  function meta(lines, keys) {
    const data = {}; let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    for (; i < lines.length; i++) {
      const m = /^\s*([^:]{2,30}):\s*(.*)$/.exec(lines[i]);
      if (!m || !keys.includes(normKey(m[1]))) break;
      const k = normKey(m[1]), v = m[2].trim();
      if (MULTI.includes(k)) (data[k] = data[k] || []).push(v); else data[k] = v;
    }
    return { data, body: lines.slice(i).join("\n").trim() };
  }
  const yes = v => /^(si|sì|s|yes|true|x|1)$/i.test(String(v || "").trim());
  // "allegato: Listino prezzi | allegati/listino.pdf" oppure solo "allegato: allegati/listino.pdf"
  function parseAllegato(v) {
    const parts = String(v || "").split("|").map(x => x.trim()).filter(Boolean);
    if (!parts.length) return null;
    const href = parts.length > 1 ? parts[1] : parts[0];
    const label = parts.length > 1 ? parts[0] : href.split("/").pop().replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
    return { href, label };
  }
  const parseTags = s => String(s || "").split(/[,;]+/).map(t => t.trim().replace(/^#/, "").trim()).filter(Boolean);

  const PARSERS = {
    aggiornamenti: txt => blocks(txt, 1).map(b => {
      const { data, body } = meta(b.lines, ["data", "tipo", "in evidenza", "allegato"]);
      return { titolo: b.titolo, data: toISO(data.data), tipo: data.tipo, in_evidenza: yes(data["in evidenza"]), testo: body,
        allegati: (data.allegato || []).map(parseAllegato).filter(Boolean) };
    }),
    proposte: txt => blocks(txt, 1).map(b => {
      const { data, body } = meta(b.lines, ["tag", "tags", "ambito", "stato", "aggiornato", "richiesta"]);
      const tags = parseTags(data.tag || data.tags);
      return { titolo: b.titolo.replace(/:\s*$/, ""), tags: tags.length ? tags : parseTags(data.ambito), stato: data.stato,
        aggiornato: toISO(data.aggiornato), richiesta: data.richiesta, motivazione: body };
    }),
    convenzioni: txt => {
      // Con sezioni: "# Sezione" e sotto "## Convenzione". Senza "##": ogni "#" è una convenzione.
      const conv = b => {
        const { data, body } = meta(b.lines, ["tag", "tags", "sconto", "valida fino al", "scadenza", "dove", "contatti", "allegato"]);
        return { titolo: b.titolo, tags: parseTags(data.tag || data.tags), sconto: data.sconto, scadenza: toISO(data["valida fino al"] || data.scadenza),
          dove: data.dove, contatti: data.contatti, allegati: (data.allegato || []).map(parseAllegato).filter(Boolean), testo: body };
      };
      if (!/^##\s/m.test(txt)) return [{ titolo: "", intro: "", link: "", voci: blocks(txt, 1).map(conv) }];
      return blocks(txt, 1).map(sec => {
        const text = sec.lines.join("\n"), cut = text.search(/^##\s/m);
        const head = meta((cut < 0 ? text : text.slice(0, cut)).split("\n"), ["link", "testo link"]);
        return { titolo: sec.titolo, link: head.data.link || "", linkLabel: head.data["testo link"] || "", intro: head.body,
          voci: cut < 0 ? [] : blocks(text.slice(cut), 2).map(conv) };
      });
    },
    segnalazioni: txt => blocks(txt, 1).map(b => {
      const { data, body } = meta(b.lines, ["tag", "tags", "stato", "reparto", "inviata il", "inviata", "risposta il", "risposta"]);
      return { titolo: b.titolo, tags: parseTags(data.tag || data.tags), stato: data.stato, reparto: data.reparto,
        inviata: toISO(data["inviata il"] || data.inviata), risposta_il: toISO(data["risposta il"]), risposta: data.risposta, testo: body };
    }),
    contatti: txt => {
      const out = { gruppi: [], altri_contatti: [] };
      blocks(txt, 1).forEach(sec => {
        const t = normKey(sec.titolo), body = sec.lines.join("\n");
        if (t.includes("salett")) {
          const s = { orari: [], luogo: "", note: "" }, extra = [];
          sec.lines.forEach(l => {
            const g = /^\s*[-*]?\s*((?:lun|mar|mer|gio|ven|sab|dom)\S*)\s*:\s*(.+)$/i.exec(l);
            const k = /^\s*(luogo|note)\s*:\s*(.*)$/i.exec(l);
            if (g) s.orari.push({ giorno: g[1].replace(/^./, c => c.toUpperCase()), orario: g[2].trim() });
            else if (k) s[k[1].toLowerCase()] = k[2].trim();
            else if (l.trim()) extra.push(l.trim());
          });
          if (extra.length) s.note = [s.note, ...extra].filter(Boolean).join("\n");
          out.saletta = s;
        } else if (!t.startsWith("altri")) {
          // Ogni altra sezione è un gruppo di persone: "# Delegati RSU COBO", "# RLS"...
          const cut = body.search(/^##\s/m);
          out.gruppi.push({
            titolo: sec.titolo.replace(/:\s*$/, ""),
            intro: (cut < 0 ? body : body.slice(0, cut)).trim(),
            persone: cut < 0 ? [] : blocks(body.slice(cut), 2).map(b => {
              const { data } = meta(b.lines, ["ruolo", "reparto", "telefono", "email", "zona", "sede"]);
              return { nome: b.titolo.replace(/:\s*$/, ""), ...data, reparto: data.reparto || data.zona || data.sede };
            })
          });
        } else {
          out.altri_contatti = blocks(body, 2).map(b => ({ nome: b.titolo, dettaglio: b.lines.join("\n").trim() }));
        }
      });
      return out;
    }
  };

  /* ---------- caricamento dati ---------- */
  async function load(name) {
    let res;
    try { res = await fetch(`dati/${name}.md`, { cache: "no-cache" }); }
    catch (_) { throw { kind: "net" }; }
    if (!res.ok) throw { kind: "net" };
    return PARSERS[name](clean(await res.text()));
  }
  function errorBox() {
    return `<div class="error"><strong>Contenuto non disponibile.</strong><br>Controllate la connessione e riaprite l'app.</div>`;
  }

  /* ---------- AGGIORNAMENTI ---------- */
  async function renderAggiornamenti(el) {
    let items;
    try { items = await load("aggiornamenti"); } catch (e) { el.innerHTML = errorBox(e); return; }
    const intro = `<p class="intro">Le ultime notizie dalla RSU FIM: com'è andata agli incontri con l'azienda, cosa si è deciso in assemblea e le comunicazioni per tutti i lavoratori.</p>`;
    if (!Array.isArray(items) || !items.length) {
      el.innerHTML = intro + `<div class="empty">Nessuna notizia per ora. Qui compariranno gli aggiornamenti dagli incontri con l'azienda e dalle assemblee.</div>`;
      return;
    }
    items = items.filter(x => x && x.titolo).map(x => ({ ...x, tags: x.tipo ? [x.tipo] : [] }))
      .sort((a, b) => (b.in_evidenza ? 1 : 0) - (a.in_evidenza ? 1 : 0) || String(b.data || "").localeCompare(String(a.data || "")));
    tagDraw.aggiornamenti = () => {
    const rows = items.filter(x => hasTag(x, "aggiornamenti"));
    el.innerHTML = intro + tagBar("aggiornamenti", items, "Tutte", "") + (rows.length ? "" : `<div class="empty">Nessuna notizia di questo tipo.</div>`) + rows.map((x, i) => {
      const isNew = daysAgo(x.data) <= 7;
      const long = String(x.testo || "").length > 320;
      return `<article class="post ${x.in_evidenza ? "pin" : ""} ${long ? "clamp" : ""}">
        <div class="post-head">
          ${x.tipo ? `<span class="pill">${esc(x.tipo)}</span>` : ""}
          ${isNew ? `<span class="pill new">Nuovo</span>` : ""}
          <span class="meta">${esc(fmtDate(x.data))}</span>
        </div>
        <h2>${esc(x.titolo)}</h2>
        ${x.testo ? `<div class="rich">${rich(x.testo)}</div>` : ""}
        ${long ? `<button class="more" type="button" aria-expanded="false" data-i="${i}">Leggi tutto</button>` : ""}
        ${(x.allegati || []).length ? `<div class="files">${x.allegati.map(f =>
          `<a class="file" href="${esc(safeHref(f.href))}" target="_blank" rel="noopener">${ICON_PDF}<span>${esc(f.label)}</span></a>`).join("")}</div>` : ""}
      </article>`;
    }).join("");
    };
    tagDraw.aggiornamenti();
  }
  document.addEventListener("click", e => {
    const b = e.target.closest(".more"); if (!b) return;
    const post = b.closest(".post"), open = post.classList.toggle("clamp") === false;
    b.textContent = open ? "Riduci" : "Leggi tutto"; b.setAttribute("aria-expanded", open);
  });

  /* ---------- CONTRATTO ---------- */
  const STATI = [
    { k: "trattativa", label: "In trattativa", c: "--s-amber" },
    { k: "presentata", label: "Presentata all'azienda", c: "--s-blue" },
    { k: "bozza", label: "In preparazione", c: "--s-gray" },
    { k: "ottenuta", label: "Ottenuta", c: "--s-green" },
    { k: "respinta", label: "Non accolta", c: "--s-red" }
  ];
  const normStato = s => {
    const v = String(s || "").toLowerCase().replace(/^in\s+/, "").trim();
    if (/^tratt/.test(v)) return "trattativa";
    if (/^present/.test(v)) return "presentata";
    if (/^(ottenut|accolt|approvat)/.test(v)) return "ottenuta";
    if (/^(respint|non accolt|rifiut)/.test(v)) return "respinta";
    return "bozza";
  };
  async function renderContratto(el) {
    let items;
    try { items = await load("proposte"); } catch (e) { el.innerHTML = errorBox(e); return; }
    const intro = `<p class="intro">Le proposte dei lavoratori per la parte normativa del contratto integrativo aziendale, raccolte dalla RSU. Per ognuna trovate a che punto è: in preparazione, presentata all'azienda o in trattativa.</p>`;
    if (!Array.isArray(items) || !items.length) { el.innerHTML = intro + `<div class="empty">Le proposte dei lavoratori per il contratto integrativo compariranno qui.</div>`; return; }
    items = items.filter(x => x && x.titolo).map(x => ({ ...x, _s: normStato(x.stato) }));
    tagDraw.contratto = () => {
      const rows = items.filter(x => hasTag(x, "contratto"));
      const counts = Object.fromEntries(STATI.map(s => [s.k, 0]));
      rows.forEach(x => counts[x._s]++);
      const tot = rows.length;
      const summary = tot ? `<div class="summary" aria-label="Riepilogo">
        <div class="bar" aria-hidden="true">${STATI.filter(s => counts[s.k]).map(s => `<span style="width:${counts[s.k] / tot * 100}%;background:var(${s.c})"></span>`).join("")}</div>
        <div class="legend">${STATI.filter(s => counts[s.k]).map(s => `<span style="--st:var(${s.c})"><i class="dot"></i>${esc(s.label)} <b>${counts[s.k]}</b></span>`).join("")}</div>
      </div>` : "";
      const groups = STATI.map(s => {
        const g = rows.filter(x => x._s === s.k).sort((a, b) => String(b.aggiornato || "").localeCompare(String(a.aggiornato || "")));
        if (!g.length) return "";
        return `<h2 class="group-title">${esc(s.label)}</h2>` + g.map(x => `
          <article class="prop" style="--st:var(${s.c})">
            <div class="prop-head"><span class="state"><i class="dot"></i>${esc(s.label)}</span></div>
            <h2>${esc(x.titolo)}</h2>
            ${x.richiesta ? `<p class="ask">${esc(x.richiesta)}</p>` : ""}
            ${x.motivazione ? `<div class="rich">${rich(x.motivazione)}</div>` : ""}
            ${x.aggiornato ? `<span class="meta">Aggiornata: ${esc(fmtDate(x.aggiornato))}</span>` : ""}
            ${x.tags.length ? `<div class="tags">${tagPills(x, "contratto")}</div>` : ""}
          </article>`).join("");
      }).join("");
      el.innerHTML = intro + tagBar("contratto", items, "Tutte") + summary + (groups || `<div class="empty">Nessuna proposta con questo tag.</div>`);
    };
    tagDraw.contratto();
  }


  /* ---------- CONTATTI ---------- */
  const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  const normDay = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3);
  function ranges(s) {
    const out = [], re = /(\d{1,2})[:.](\d{2})\s*[-–—a]+\s*(\d{1,2})[:.](\d{2})/g; let m;
    while ((m = re.exec(String(s || "")))) out.push([+m[1] * 60 + +m[2], +m[3] * 60 + +m[4], `${m[1]}:${m[2]}`]);
    return out;
  }
  function roomStatus(orari) {
    const now = new Date(), today = GIORNI[now.getDay()], mins = now.getHours() * 60 + now.getMinutes();
    const rs = (orari || []).filter(o => normDay(o.giorno) === today).flatMap(o => ranges(o.orario));
    if (!rs.length) return null;
    if (rs.some(([a, b]) => mins >= a && mins < b)) return { label: "Aperta ora", c: "--s-green" };
    const next = rs.filter(([a]) => a > mins).sort((x, y) => x[0] - y[0])[0];
    return next ? { label: `Apre oggi alle ${next[2]}`, c: "--s-amber" } : { label: "Chiusa per oggi", c: "--s-gray" };
  }
  const initials = n => String(n || "").replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  const ICON_TEL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.1 6.1l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const ICON_MAIL = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

  async function renderContatti(el) {
    let d;
    try { d = await load("contatti"); } catch (e) { el.innerHTML = errorBox(e); return; }
    d = d || {};
    let html = "";
    const s = d.saletta;
    if (s) {
      const st = roomStatus(s.orari), today = GIORNI[new Date().getDay()];
      html += `<section class="room" aria-label="Saletta sindacale">
        <div class="room-head"><h2>Saletta sindacale</h2>${st ? `<span class="open" style="--st:var(${st.c})"><i class="dot"></i>${esc(st.label)}</span>` : ""}</div>
        ${s.luogo ? `<span class="meta">${esc(s.luogo)}</span>` : ""}
        ${(s.orari || []).length ? `<ul class="hours">${s.orari.map(o => `<li class="${normDay(o.giorno) === today ? "today" : ""}"><span class="g">${esc(o.giorno)}</span><span>${esc(o.orario)}</span></li>`).join("")}</ul>` : ""}
        ${s.note ? `<div class="rich meta">${rich(s.note)}</div>` : ""}
      </section>`;
    }
    (d.gruppi || []).forEach((g, gi) => {
      const del = (g.persone || []).filter(p => p && p.nome);
      if (!del.length && !g.intro) return;
      html += `<h2 class="section-title">${esc(g.titolo)}</h2>` + (g.intro ? `<div class="rich meta">${rich(g.intro)}</div>` : "") +
        `<ul class="people ${gi > 0 ? "alt" : ""}">` + del.map(p => {
        const tel = String(p.telefono || "").trim(), mail = String(p.email || "").trim();
        const telHref = tel.replace(/[^\d+]/g, "");
        return `<li class="person">
          <span class="ini" aria-hidden="true">${esc(initials(p.nome))}</span>
          <h3>${esc(p.nome)}</h3>
          <span class="meta">${esc([p.ruolo, p.reparto].filter(Boolean).join(" · "))}</span>
          ${(tel || mail) ? `<div class="acts">
            ${tel ? `<a class="btn" href="tel:${esc(telHref)}">${ICON_TEL}${esc(tel)}</a>` : ""}
            ${mail ? `<a class="btn" href="mailto:${esc(mail)}">${ICON_MAIL}Scrivi</a>` : ""}
          </div>` : ""}
        </li>`;
      }).join("") + `</ul>`;
    });
    const other = (d.altri_contatti || []).filter(o => o && o.nome);
    if (other.length) {
      html += `<h2 class="group-title">Altri contatti</h2><div class="other">` +
        other.map(o => `<div><strong>${esc(o.nome)}</strong>${o.dettaglio ? `<div class="rich meta">${rich(o.dettaglio)}</div>` : ""}</div>`).join("") + `</div>`;
    }
    el.innerHTML = html || `<div class="empty">I contatti della RSU compariranno qui.</div>`;
  }

  /* ---------- filtri per tag (Convenzioni e Segnalazioni) ---------- */
  const tagSel = {}, tagDraw = {};
  const fmtLong = s => { const d = parseISO(s); return d ? `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}` : ""; };
  function tagBar(view, items, allLabel, hash = "#") {
    const map = new Map();
    items.forEach(x => (x.tags || []).forEach(t => {
      const k = normKey(t); const e = map.get(k) || { label: t, n: 0 }; e.n++; map.set(k, e);
    }));
    if (!map.size) return "";
    const sel = tagSel[view] || "";
    const list = [...map.entries()].sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label, "it"));
    return `<div class="filters" role="group" aria-label="Filtra per tag">
      <button type="button" class="fchip" data-tagview="${view}" data-tag="" aria-pressed="${!sel}">${esc(allLabel)} <b>${items.length}</b></button>
      ${list.map(([k, e]) => `<button type="button" class="fchip" data-tagview="${view}" data-tag="${esc(k)}" aria-pressed="${sel === k}">${hash}${esc(e.label)} <b>${e.n}</b></button>`).join("")}
    </div>`;
  }
  const hasTag = (x, view) => !tagSel[view] || (x.tags || []).some(t => normKey(t) === tagSel[view]);
  const tagPills = (x, view) => (x.tags || []).map(t =>
    `<button type="button" class="tag" data-tagview="${view}" data-tag="${esc(normKey(t))}">#${esc(t)}</button>`).join("");
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-tagview]"); if (!b) return;
    const view = b.dataset.tagview, k = b.dataset.tag;
    tagSel[view] = (b.classList.contains("fchip") || tagSel[view] !== k) ? k : "";
    if (tagDraw[view]) tagDraw[view]();
    if (b.classList.contains("tag")) { const f = $("#v-" + view + " .filters"); if (f) f.scrollIntoView({ block: "nearest" }); window.scrollTo({ top: 0 }); }
  });

  /* ---------- CONVENZIONI ---------- */
  const ICON_PDF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v4h4M9 13h6M9 16.5h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const ICON_EXT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const safeHref = h => /^(https?:\/\/|[\w./ -]+$)/i.test(h) && !/^\s*javascript:/i.test(h) ? h : "#";
  function convCard(x) {
    const left = x.scadenza ? -daysAgo(x.scadenza) : null;
    const exp = x.scadenza ? `<span class="meta ${left <= 30 ? "warn" : ""}">Valida fino al ${esc(fmtLong(x.scadenza))}${left <= 30 ? (left === 0 ? " · scade oggi" : ` · scade tra ${left} ${left === 1 ? "giorno" : "giorni"}`) : ""}</span>` : "";
    return `<article class="post">
      ${x.tags.length ? `<div class="post-head">${tagPills(x, "convenzioni")}</div>` : ""}
      <h2>${esc(x.titolo)}</h2>
      ${x.sconto ? `<p class="deal">${esc(x.sconto)}</p>` : ""}
      ${x.testo ? `<div class="rich">${rich(x.testo)}</div>` : ""}
      ${(x.dove || x.contatti) ? `<dl class="facts">
        ${x.dove ? `<div><dt>Dove</dt><dd>${inline(x.dove)}</dd></div>` : ""}
        ${x.contatti ? `<div><dt>Contatti</dt><dd>${inline(x.contatti)}</dd></div>` : ""}
      </dl>` : ""}
      ${x.allegati.length ? `<div class="files">${x.allegati.map(f =>
        `<a class="file" href="${esc(safeHref(f.href))}" target="_blank" rel="noopener">${ICON_PDF}<span>${esc(f.label)}</span></a>`).join("")}</div>` : ""}
      ${exp}
    </article>`;
  }
  async function renderConvenzioni(el) {
    let secs;
    try { secs = await load("convenzioni"); } catch (e) { el.innerHTML = errorBox(e); return; }
    const intro = `<p class="intro">Sconti e agevolazioni per chi lavora in COBO e per gli iscritti CISL. Toccate un tag per vedere solo quelle che vi interessano.</p>`;
    secs = (secs || []).map(sec => {
      const voci = sec.voci.filter(x => x && x.titolo);
      const active = voci.filter(x => !x.scadenza || daysAgo(x.scadenza) <= 0); // stesso ordine del file
      return { ...sec, active, expired: voci.length - active.length };
    }).filter(sec => sec.titolo || sec.link || sec.intro || sec.active.length);
    const all = secs.flatMap(sec => sec.active);
    if (!secs.length) { el.innerHTML = intro + `<div class="empty">Nessuna convenzione attiva al momento.</div>`; return; }
    tagDraw.convenzioni = () => {
      el.innerHTML = intro + secs.map(sec => {
        const rows = sec.active.filter(x => hasTag(x, "convenzioni"));
        const head = sec.titolo ? `<h2 class="section-title">${esc(sec.titolo)}</h2>` : "";
        const box = (sec.intro || sec.link) ? `<div class="linkcard">
            ${sec.intro ? `<div class="rich">${rich(sec.intro)}</div>` : ""}
            ${sec.link ? `<a class="btn primary" href="${esc(safeHref(sec.link))}" target="_blank" rel="noopener">${esc(sec.linkLabel || "Apri il sito")}${ICON_EXT}</a>` : ""}
          </div>` : "";
        const bar = sec.active.length ? tagBar("convenzioni", all, "Tutte") : "";
        const list = sec.active.length
          ? (rows.length ? rows.map(convCard).join("") : `<div class="empty">Nessuna convenzione con questo tag in questa sezione.</div>`)
          : "";
        const exp = sec.expired ? `<p class="meta">${sec.expired === 1 ? "1 convenzione scaduta non è mostrata." : `${sec.expired} convenzioni scadute non sono mostrate.`}</p>` : "";
        return `<section class="conv-sec">${head}${box}${bar}${list}${exp}</section>`;
      }).join("");
    };
    tagDraw.convenzioni();
  }

  /* ---------- SEGNALAZIONI ---------- */
  const STATI_S = [
    { k: "lavorazione", label: "In lavorazione", c: "--s-blue" },
    { k: "riferita", label: "Riferita all'azienda", c: "--s-amber" },
    { k: "dariferire", label: "Da riferire all'azienda", c: "--s-white" },
    { k: "chiusa", label: "Chiusa", c: "--s-closed" }
  ];
  function normStatoS(x) {
    const v = normKey(x.stato);
    if (/lavoraz/.test(v)) return "lavorazione";
    if (/^(da rifer|da invia|bozza|prepar|da fare)/.test(v)) return "dariferire";
    if (/^(rifer|in attesa|attesa|inviata|aperta)/.test(v)) return "riferita";
    if (/^(chius|risolt|respint|non accolt|rifiut|fatt|rispost)/.test(v)) return "chiusa";
    return x.inviata ? "riferita" : "dariferire";
  }
  async function renderSegnalazioni(el) {
    let items;
    try { items = await load("segnalazioni"); } catch (e) { el.innerHTML = errorBox(e); return; }
    const intro = `<p class="intro">Proposte e segnalazioni raccolte tra i lavoratori che la RSU porta all'azienda: quelle da riferire, quelle già riferite o in lavorazione e quelle chiuse.</p>`;
    items = (items || []).filter(x => x && x.titolo).map(x => ({ ...x, _s: normStatoS(x) }));
    if (!items.length) { el.innerHTML = intro + `<div class="empty">Nessuna richiesta per ora.</div>`; return; }
    tagDraw.segnalazioni = () => {
      const rows = items.filter(x => hasTag(x, "segnalazioni"));
      const counts = Object.fromEntries(STATI_S.map(s => [s.k, 0])); rows.forEach(x => counts[x._s]++);
      const tot = rows.length;
      const summary = tot ? `<div class="summary" aria-label="Riepilogo">
        <div class="bar" aria-hidden="true">${STATI_S.filter(s => counts[s.k]).map(s => `<span class="st-${s.k}" style="width:${counts[s.k] / tot * 100}%;background:var(${s.c})"></span>`).join("")}</div>
        <div class="legend">${STATI_S.filter(s => counts[s.k]).map(s => `<span class="st-${s.k}" style="--st:var(${s.c})"><i class="dot"></i>${esc(s.label)} <b>${counts[s.k]}</b></span>`).join("")}</div>
      </div>` : "";
      const groups = STATI_S.map(s => {
        const g = rows.filter(x => x._s === s.k).sort((a, b) => s.k === "riferita" || s.k === "lavorazione"
          ? String(a.inviata || "9").localeCompare(String(b.inviata || "9"))
          : String(b.inviata || "").localeCompare(String(a.inviata || "")));
        if (!g.length) return "";
        return `<h2 class="group-title">${esc(s.label)}</h2>` + g.map(x => {
          const info = [x.reparto, x.inviata ? `inviata il ${fmtLong(x.inviata)}` : ""].filter(Boolean).join(" · ");
          return `<article class="prop st-${s.k}" style="--st:var(${s.c})">
            <div class="prop-head">
              <span class="state"><i class="dot"></i>${esc(s.label)}</span>
            </div>
            <h2>${esc(x.titolo)}</h2>
            ${x.testo ? `<div class="rich">${rich(x.testo)}</div>` : ""}
            ${x.risposta ? `<div class="reply"><h3>Risposta dell'azienda${x.risposta_il ? ` · ${esc(fmtLong(x.risposta_il))}` : ""}</h3><p>${inline(x.risposta)}</p></div>` : ""}
            ${info ? `<span class="meta">${esc(info.charAt(0).toUpperCase() + info.slice(1))}</span>` : ""}
            ${x.tags.length ? `<div class="tags">${tagPills(x, "segnalazioni")}</div>` : ""}
          </article>`;
        }).join("");
      }).join("");
      el.innerHTML = intro + tagBar("segnalazioni", items, "Tutte") + summary + (groups || `<div class="empty">Nessuna richiesta con questo tag.</div>`);
    };
    tagDraw.segnalazioni();
  }

  /* ---------- navigazione ---------- */
  const VIEWS = {
    aggiornamenti: { title: "News", render: renderAggiornamenti },
    contratto: { title: "Contratto integrativo", render: renderContratto },
    convenzioni: { title: "Convenzioni", render: renderConvenzioni },
    segnalazioni: { title: "Richieste dei lavoratori", render: renderSegnalazioni },
    contatti: { title: "Contatti", render: renderContatti }
  };
  const rendered = {};
  function show(name, fromNav) {
    if (!VIEWS[name]) name = "aggiornamenti";
    Object.keys(VIEWS).forEach(k => { $("#v-" + k).hidden = k !== name; });
    document.querySelectorAll(".tabbar a").forEach(a => {
      if (a.dataset.view === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("#pageTitle").textContent = VIEWS[name].title;
    document.title = `${VIEWS[name].title} · RSU FIM COBO`;
    const el = $("#v-" + name);
    if (!rendered[name]) { el.innerHTML = `<div class="skel"></div><div class="skel"></div>`; rendered[name] = VIEWS[name].render(el); }
    if (fromNav) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", () => show(location.hash.slice(1), true));
  show(location.hash.slice(1), false);

  // riaprendo l'app dopo un po', ricarica i contenuti
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) {
      Object.keys(rendered).forEach(k => delete rendered[k]);
      show(location.hash.slice(1), false);
    }
  });

  /* ---------- offline ---------- */
  const syncOnline = () => { $("#offline").hidden = navigator.onLine !== false; };
  window.addEventListener("online", syncOnline); window.addEventListener("offline", syncOnline); syncOnline();

  /* ---------- installazione ---------- */
  const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;
  if (!standalone && !store.get("rsu-install-chiuso")) {
    if (isIOS) {
      $("#installHow").textContent = "Tocca il pulsante Condividi di Safari e poi «Aggiungi alla schermata Home».";
      $("#install").hidden = false;
    }
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault(); deferred = e;
      $("#installBtn").hidden = false; $("#install").hidden = false;
    });
  }
  $("#installBtn").addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (_) {}
    deferred = null; $("#install").hidden = true;
  });
  $("#installClose").addEventListener("click", () => { $("#install").hidden = true; store.set("rsu-install-chiuso", "1"); });
  window.addEventListener("appinstalled", () => { $("#install").hidden = true; });

  /* ---------- condivisione con QR code ---------- */
  // Il link è sempre quello da cui è aperta l'app: non serve configurarlo.
  // Online usa l'indirizzo da cui è aperta; se il file si apre dal computer usa quello pubblico.
  const appUrl = /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname)
    ? new URL("./", location.href).href : "https://rsu-fim-cobo.github.io/";
  function qrSvg(text) {
    if (typeof qrcode !== "function") return "";
    const q = qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(), m = 2; let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  const dlg = $("#share");
  $("#shareOpen").addEventListener("click", () => {
    if (!$("#qr").innerHTML) $("#qr").innerHTML = qrSvg(appUrl);
    $("#shareUrl").textContent = appUrl;
    $("#shareToast").textContent = "";
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  });
  $("#shareClose").addEventListener("click", () => dlg.close ? dlg.close() : dlg.removeAttribute("open"));
  dlg.addEventListener("click", e => { if (e.target === dlg && dlg.close) dlg.close(); });
  if (navigator.share) {
    $("#shareNative").hidden = false;
    $("#shareNative").addEventListener("click", () => {
      navigator.share({ title: "RSU FIM COBO", text: "L'app della RSU FIM di COBO: news, contratto integrativo, convenzioni e contatti.", url: appUrl }).catch(() => {});
    });
  }
  $("#shareCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(appUrl); $("#shareToast").textContent = "Link copiato"; }
    catch (_) {
      const r = document.createRange(); r.selectNodeContents($("#shareUrl"));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      $("#shareToast").textContent = "Link selezionato: tienilo premuto per copiarlo";
    }
  });

  /* ---------- service worker (funzionamento offline) ---------- */
  if ("serviceWorker" in navigator) {
    // Controlla subito se è stata pubblicata una versione nuova e, quando arriva, ricarica la pagina una volta.
    const hadController = !!navigator.serviceWorker.controller; let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return; reloading = true; location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then(r => { r.update().catch(() => {}); document.addEventListener("visibilitychange", () => { if (!document.hidden) r.update().catch(() => {}); }); })
        .catch(() => {});
    });
  }
})();
