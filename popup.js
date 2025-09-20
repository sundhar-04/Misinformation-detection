// // popup.js
// const BACKEND_BASE = "http://127.0.0.1:8000";
// const VERIFY_ENDPOINT = `${BACKEND_BASE}/verify`;
// const VERIFY_PAGE_ENDPOINT = `${BACKEND_BASE}/verify-page`;
// const CONCURRENCY = 5;
// const HISTORY_KEY = "misinfo_history_v1";

// document.addEventListener("DOMContentLoaded", () => {
//   // UI elements
//   const scanBtn = document.getElementById("scanBtn");
//   const status = document.getElementById("status");
//   const resultsDiv = document.getElementById("results");
//   const batchCheckbox = document.getElementById("batchCheckbox");
//   const historyList = document.getElementById("historyList");
//   const clearHistoryBtn = document.getElementById("clearHistory");
//   const fakeCountEl = document.getElementById("fakeCount");
//   const verifiedCountEl = document.getElementById("verifiedCount");
//   const avgConfidenceEl = document.getElementById("avgConfidence");

//   // Tabs
//   const tabBtns = document.querySelectorAll(".tab-btn");
//   const tabs = document.querySelectorAll(".tab-content");
//   tabBtns.forEach(btn => {
//     btn.addEventListener("click", () => {
//       tabBtns.forEach(b => b.classList.remove("active"));
//       tabs.forEach(t => t.classList.remove("active"));
//       btn.classList.add("active");
//       document.getElementById(btn.dataset.tab).classList.add("active");
//       if (btn.dataset.tab === "history") loadHistory();
//       if (btn.dataset.tab === "stats") loadStats();
//     });
//   });

//   // Scan click
//   scanBtn.addEventListener("click", async () => {
//     resultsDiv.innerHTML = "";
//     status.textContent = "🔎 Extracting page text...";
//     scanBtn.disabled = true;

//     try {
//       const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
//       const exec = await chrome.scripting.executeScript({
//         target: { tabId: tab.id },
//         func: () => document.body.innerText
//       });

//       const pageText = exec?.[0]?.result?.trim() || "";
//       if (!pageText) {
//         status.textContent = "ℹ️ No text found on the page.";
//         scanBtn.disabled = false;
//         return;
//       }

//       let fakeResults = [];
//       if (batchCheckbox.checked) {
//         status.textContent = "🔁 Batch scanning...";
//         fakeResults = await batchScan(pageText, tab.id);
//       } else {
//         status.textContent = "↯ Scanning sentence-by-sentence...";
//         fakeResults = await perSentenceScan(pageText, tab.id);
//       }

//       // Save every scan (even if no fake results)
//       saveHistory({
//         url: tab.url || "unknown",
//         title: tab.title || tab.url || "page",
//         date: new Date().toLocaleString(),
//         results: fakeResults
//       });

//       loadHistory(); // update history list
//       loadStats();   // update stats UI

//     } catch (e) {
//       console.error(e);
//       status.textContent = "❌ Error: " + (e.message || e);
//     } finally {
//       scanBtn.disabled = false;
//     }
//   });

//   // Batch scanning
//   async function batchScan(pageText, tabId) {
//     resultsDiv.innerHTML = "";
//     try {
//       const res = await fetch(VERIFY_PAGE_ENDPOINT, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ text: pageText })
//       });
//       if (!res.ok) {
//         status.textContent = `❌ Server error: ${res.status}`;
//         return [];
//       }
//       const data = await res.json();
//       if (!data.results || !Array.isArray(data.results)) {
//         status.textContent = "⚠️ Unexpected response format from backend.";
//         return [];
//       }

//       // filter only unverified/fake
//       const fake = data.results.filter(r => (r.label || "").toLowerCase() === "unverified" || (r.label || "").toLowerCase() === "fake");

//       // normalize items to { text, label, confidence, evidence }
//       const normalized = fake.map(r => ({
//         text: (r.sentence || r.claim || r.text || "").trim(),
//         label: r.label,
//         confidence: Number(r.confidence || 0),
//         evidence: r.evidence || r.evidence || []
//       }));

//       renderFakeResults(normalized);
//       const textsToHighlight = normalized.map(i => i.text).filter(Boolean);
//       highlightFakeText(textsToHighlight, tabId);

//       status.textContent = `✅ Done — ${normalized.length} fake claim(s) detected.`;
//       return normalized;
//     } catch (err) {
//       console.error(err);
//       status.textContent = "❌ Error contacting backend.";
//       return [];
//     }
//   }

//   // Per-sentence scanning (concurrency workers)
//   async function perSentenceScan(pageText, tabId) {
//     resultsDiv.innerHTML = "";
//     const sentences = pageText
//       .split(/\n|(?<=[.!?])\s+/)
//       .map(s => s.trim())
//       .filter(s => s.length > 10);

//     if (!sentences.length) {
//       status.textContent = "ℹ️ No sentences to scan.";
//       return [];
//     }

//     const fakeResults = [];
//     let i = 0;

//     async function worker() {
//       while (true) {
//         const idx = i++;
//         if (idx >= sentences.length) break;
//         const sentence = sentences[idx];
//         try {
//           const res = await fetch(VERIFY_ENDPOINT, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ claim: sentence })
//           });
//           if (!res.ok) continue;
//           const data = await res.json();
//           if ((data.label || "").toLowerCase() === "unverified" || (data.label || "").toLowerCase() === "fake") {
//             fakeResults.push({
//               text: sentence,
//               label: data.label,
//               confidence: Number(data.confidence || 0),
//               evidence: data.evidence || []
//             });
//           }
//         } catch (err) {
//           console.warn("Fetch error:", err);
//         }
//       }
//     }

//     const workers = Array.from({ length: Math.min(CONCURRENCY, sentences.length) }, () => worker());
//     await Promise.all(workers);

//     renderFakeResults(fakeResults);
//     highlightFakeText(fakeResults.map(f => f.text), tabId);

//     status.textContent = `✅ Done — ${fakeResults.length} fake claim(s) detected.`;
//     return fakeResults;
//   }

//   // Render results array of { text, label, confidence, evidence }
//   function renderFakeResults(fakeArray) {
//     resultsDiv.innerHTML = "";
//     if (!fakeArray || fakeArray.length === 0) {
//       resultsDiv.innerHTML = `<p>✅ No fake claims detected on this page.</p>`;
//       return;
//     }

//     const summary = document.createElement("p");
//     summary.innerHTML = `<strong>Total Fake Claims Detected:</strong> ${fakeArray.length}`;
//     resultsDiv.appendChild(summary);

//     fakeArray.forEach(item => {
//       const container = document.createElement("div");
//       container.className = "fake";

//       const sentenceNode = document.createElement("div");
//       sentenceNode.innerHTML = `<strong>❌ ${escapeHtml(item.text)}</strong> <div class="small">(${escapeHtml(item.label || "")} — ${(Number(item.confidence) || 0).toFixed(2)})</div>`;
//       container.appendChild(sentenceNode);

//       // evidence might be array of objects or strings
//       if (item.evidence && item.evidence.length > 0) {
//         const evList = document.createElement("div");
//         evList.className = "evidence-list";

//         item.evidence.slice(0, 10).forEach(ev => {
//           const li = document.createElement("div");
//           if (typeof ev === "string") {
//             li.textContent = ev;
//           } else if (ev && typeof ev === "object") {
//             const title = ev.title || ev.name || ev.snippet || ev.url || "Untitled";
//             const url = ev.url || ev.link || "#";
//             const src = ev.source || ev.publisher || "";
//             li.innerHTML = `<div>${escapeHtml(title)} ${src ? `<span class="small">(${escapeHtml(src)})</span>` : ""}</div><div class="small"><a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a></div>`;
//           }
//           evList.appendChild(li);
//         });

//         container.appendChild(evList);
//       } else {
//         const noEv = document.createElement("div");
//         noEv.className = "small";
//         noEv.textContent = "No supporting evidence found.";
//         container.appendChild(noEv);
//       }

//       resultsDiv.appendChild(container);
//     });
//   }

//   // Highlight sentences in the current page using text-node walker (safe)
//   function highlightFakeText(fakeSentences, tabId) {
//     // ensure sentences array
//     const arr = (fakeSentences || []).map(s => (s || "").trim()).filter(Boolean);
//     chrome.scripting.executeScript({
//       target: { tabId },
//       func: (sentences) => {
//         // remove previous highlights
//         document.querySelectorAll("span.misinfo-highlight").forEach(sp => {
//           const parent = sp.parentNode;
//           if (!parent) return;
//           parent.replaceChild(document.createTextNode(sp.textContent), sp);
//         });

//         if (!sentences || sentences.length === 0) return;

//         // Normalize set to avoid duplicates
//         const normalized = Array.from(new Set(sentences.map(s => s.trim()).filter(Boolean)));

//         // Walk text nodes
//         const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
//           acceptNode: function(node) {
//             if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
//             const parentName = node.parentNode && node.parentNode.nodeName;
//             if (["SCRIPT","STYLE","TEXTAREA","CODE","NOSCRIPT"].includes(parentName)) return NodeFilter.FILTER_REJECT;
//             return NodeFilter.FILTER_ACCEPT;
//           }
//         }, false);

//         const textNodes = [];
//         while (walker.nextNode()) textNodes.push(walker.currentNode);

//         // For each text node, detect all sentence matches and replace node with fragment
//         textNodes.forEach(node => {
//           if (!node.parentNode) return;
//           const original = node.nodeValue;
//           const lower = original.toLowerCase();
//           const matches = [];

//           normalized.forEach(s => {
//             const sLower = s.toLowerCase();
//             let idx = lower.indexOf(sLower);
//             while (idx !== -1) {
//               matches.push({ start: idx, end: idx + sLower.length, text: original.slice(idx, idx + sLower.length) });
//               idx = lower.indexOf(sLower, idx + sLower.length);
//             }
//           });

//           if (matches.length === 0) return;

//           // Merge & sort non-overlapping
//           matches.sort((a,b) => a.start - b.start);
//           const nonOverlap = [];
//           for (const m of matches) {
//             if (nonOverlap.length === 0) nonOverlap.push(m);
//             else {
//               const last = nonOverlap[nonOverlap.length-1];
//               if (m.start >= last.end) nonOverlap.push(m);
//               // else overlapping: skip or you could extend last.end = Math.max(last.end, m.end)
//             }
//           }

//           // Build fragment
//           const frag = document.createDocumentFragment();
//           let lastIndex = 0;
//           for (const m of nonOverlap) {
//             if (m.start > lastIndex) frag.appendChild(document.createTextNode(original.slice(lastIndex, m.start)));
//             const span = document.createElement("span");
//             span.className = "misinfo-highlight";
//             span.textContent = original.slice(m.start, m.end);
//             span.style.backgroundColor = "yellow";
//             span.style.color = "red";
//             span.style.fontWeight = "600";
//             span.style.borderRadius = "2px";
//             frag.appendChild(span);
//             lastIndex = m.end;
//           }
//           if (lastIndex < original.length) frag.appendChild(document.createTextNode(original.slice(lastIndex)));
//           node.parentNode.replaceChild(frag, node);
//         });
//       },
//       args: [arr]
//     }).catch(err => console.warn("Highlight error:", err));
//   }

//   // -------------------------
//   // History (chrome.storage.local)
//   // -------------------------
//   function saveHistory(entry) {
//     chrome.storage.local.get([HISTORY_KEY], data => {
//       const existing = data[HISTORY_KEY] || [];
//       const newHistory = [entry, ...existing].slice(0, 50); // keep last 50
//       chrome.storage.local.set({ [HISTORY_KEY]: newHistory }, () => {
//         // nothing else
//       });
//     });
//   }

//   function loadHistory() {
//     chrome.storage.local.get([HISTORY_KEY], data => {
//       const hist = data[HISTORY_KEY] || [];
//       historyList.innerHTML = "";
//       if (hist.length === 0) {
//         historyList.textContent = "No history yet.";
//         return;
//       }
//       hist.forEach((h, idx) => {
//         const div = document.createElement("div");
//         div.className = "card history-entry";
//         div.innerHTML = `<strong>${escapeHtml(h.title || h.url)}</strong><div class="small">${escapeHtml(h.date)} — Fake: ${h.results.length}</div>`;
//         div.addEventListener("click", () => {
//           // show details in results area
//           renderFakeResults(h.results || []);
//           // switch to Detected tab to view details
//           document.querySelector('.tab-btn[data-tab="claims"]').click();
//         });
//         historyList.appendChild(div);
//       });
//     });
//   }

//   clearHistoryBtn.addEventListener("click", () => {
//     chrome.storage.local.set({ [HISTORY_KEY]: [] }, () => {
//       historyList.innerHTML = "History cleared.";
//       // clear stats
//       updateStatsFromHistory([]);
//     });
//   });

//   // Stats: aggregate from history
//   function loadStats() {
//     chrome.storage.local.get([HISTORY_KEY], data => {
//       const hist = data[HISTORY_KEY] || [];
//       updateStatsFromHistory(hist);
//     });
//   }

//   function updateStatsFromHistory(hist) {
//     const historyArray = Array.isArray(hist) ? hist : [];
//     let fakeCount = 0;
//     let verifiedCount = 0;
//     let confSum = 0;
//     let confCount = 0;

//     historyArray.forEach(h => {
//       (h.results || []).forEach(r => {
//         const conf = Number(r.confidence || 0);
//         if ((r.label || "").toLowerCase() === "unverified" || (r.label || "").toLowerCase() === "fake") {
//           fakeCount++;
//         } else {
//           verifiedCount++;
//         }
//         if (!isNaN(conf)) {
//           confSum += conf;
//           confCount++;
//         }
//       });
//     });

//     fakeCountEl.textContent = fakeCount;
//     verifiedCountEl.textContent = verifiedCount;
//     avgConfidenceEl.textContent = confCount ? Math.round((confSum / confCount) * 100) + "%" : "N/A";
//   }

//   // Small helpers
//   function escapeHtml(s) {
//     if (!s) return "";
//     return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
//   }
//   function escapeAttr(s) {
//     if (!s) return "#";
//     return (""+s).replace(/"/g,'&quot;').replace(/'/g,"&#39;");
//   }

//   // On load: show history & stats
//   loadHistory();
//   loadStats();
// });


// popup.js
const BACKEND_BASE = "http://127.0.0.1:8000";
const VERIFY_ENDPOINT = `${BACKEND_BASE}/verify`;
const VERIFY_PAGE_ENDPOINT = `${BACKEND_BASE}/verify-page`;
const CONCURRENCY = 5;
const HISTORY_KEY = "misinfo_history_v1";

// --------- Helpers for Text Cleaning ---------
function cleanText(text) {
  return text
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/[^a-zA-Z0-9.,?!'"\s]/g, "") // remove junk symbols
    .trim();
}

function splitIntoSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.split(" ").length > 5); // skip short/weak lines
}

document.addEventListener("DOMContentLoaded", () => {
  // UI elements
  const scanBtn = document.getElementById("scanBtn");
  const status = document.getElementById("status");
  const resultsDiv = document.getElementById("results");
  const batchCheckbox = document.getElementById("batchCheckbox");
  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistory");
  const fakeCountEl = document.getElementById("fakeCount");
  const verifiedCountEl = document.getElementById("verifiedCount");
  const avgConfidenceEl = document.getElementById("avgConfidence");

  // Tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabs = document.querySelectorAll(".tab-content");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabs.forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "history") loadHistory();
      if (btn.dataset.tab === "stats") loadStats();
    });
  });

  // Scan click
  scanBtn.addEventListener("click", async () => {
    resultsDiv.innerHTML = "";
    status.textContent = "🔎 Extracting page text...";
    scanBtn.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const exec = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const article = document.querySelector("article, main") || document.body;
          return article.innerText;
        }
      });

      const pageText = cleanText(exec?.[0]?.result?.trim() || "");
      if (!pageText) {
        status.textContent = "ℹ️ No text found on the page.";
        scanBtn.disabled = false;
        return;
      }

      let fakeResults = [];
      if (batchCheckbox.checked) {
        status.textContent = "🔁 Batch scanning...";
        fakeResults = await batchScan(pageText, tab.id);
      } else {
        status.textContent = "↯ Scanning sentence-by-sentence...";
        fakeResults = await perSentenceScan(pageText, tab.id);
      }

      saveHistory({
        url: tab.url || "unknown",
        title: tab.title || tab.url || "page",
        date: new Date().toLocaleString(),
        results: fakeResults
      });

      loadHistory();
      loadStats();
    } catch (e) {
      console.error(e);
      status.textContent = "❌ Error: " + (e.message || e);
    } finally {
      scanBtn.disabled = false;
    }
  });

  // --------- Batch scanning ---------
  async function batchScan(pageText, tabId) {
    resultsDiv.innerHTML = "";
    try {
      // Chunk large pages
      const chunks = [];
      const maxLen = 2000;
      for (let i = 0; i < pageText.length; i += maxLen) {
        if (chunks.length >= 10) break; // limit
        chunks.push(pageText.slice(i, i + maxLen));
      }

      let allResults = [];
      for (const chunk of chunks) {
        const res = await fetch(VERIFY_PAGE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk })
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data.results)) {
          allResults = allResults.concat(data.results);
        }
      }

      const fake = allResults.filter(r =>
        ["fake", "unverified"].includes((r.label || "").toLowerCase())
      );

      const normalized = fake.map(r => ({
        text: (r.sentence || r.claim || r.text || "").trim(),
        label: r.label,
        confidence: Number(r.confidence || 0),
        evidence: r.evidence || []
      }));

      renderFakeResults(normalized);
      highlightFakeText(normalized.map(i => i.text), tabId);

      status.textContent = `✅ Done — ${normalized.length} fake claim(s) detected.`;
      return normalized;
    } catch (err) {
      console.error(err);
      status.textContent = "❌ Error contacting backend.";
      return [];
    }
  }

  // --------- Per-sentence scanning ---------
  async function perSentenceScan(pageText, tabId) {
    resultsDiv.innerHTML = "";
    const sentences = splitIntoSentences(pageText);

    if (!sentences.length) {
      status.textContent = "ℹ️ No sentences to scan.";
      return [];
    }

    const fakeResults = [];
    let i = 0;

    async function worker() {
      while (true) {
        const idx = i++;
        if (idx >= sentences.length) break;
        const sentence = sentences[idx];
        try {
          const res = await fetch(VERIFY_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claim: sentence })
          });
          if (!res.ok) continue;
          const data = await res.json();
          if (["fake", "unverified"].includes((data.label || "").toLowerCase())) {
            fakeResults.push({
              text: sentence,
              label: data.label,
              confidence: Number(data.confidence || 0),
              evidence: data.evidence || []
            });
          }
        } catch (err) {
          console.warn("Fetch error:", err);
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, sentences.length) }, () => worker());
    await Promise.all(workers);

    renderFakeResults(fakeResults);
    highlightFakeText(fakeResults.map(f => f.text), tabId);

    status.textContent = `✅ Done — ${fakeResults.length} fake claim(s) detected.`;
    return fakeResults;
  }

  // --------- Render fake results ---------
  function renderFakeResults(fakeArray) {
    resultsDiv.innerHTML = "";
    if (!fakeArray || fakeArray.length === 0) {
      resultsDiv.innerHTML = `<p>✅ No fake claims detected on this page.</p>`;
      return;
    }

    const summary = document.createElement("p");
    summary.innerHTML = `<strong>Total Fake Claims Detected:</strong> ${fakeArray.length}`;
    resultsDiv.appendChild(summary);

    fakeArray.forEach(item => {
      const container = document.createElement("div");
      container.className = "fake";

      const sentenceNode = document.createElement("div");
      sentenceNode.innerHTML = `<strong>❌ ${escapeHtml(item.text)}</strong> <div class="small">(${escapeHtml(item.label || "")} — ${(Number(item.confidence) || 0).toFixed(2)})</div>`;
      container.appendChild(sentenceNode);

      if (item.evidence && item.evidence.length > 0) {
        const evList = document.createElement("div");
        evList.className = "evidence-list";
        item.evidence.slice(0, 10).forEach(ev => {
          const li = document.createElement("div");
          if (typeof ev === "string") {
            li.textContent = ev;
          } else if (ev && typeof ev === "object") {
            const title = ev.title || ev.name || ev.snippet || ev.url || "Untitled";
            const url = ev.url || ev.link || "#";
            const src = ev.source || ev.publisher || "";
            li.innerHTML = `<div>${escapeHtml(title)} ${src ? `<span class="small">(${escapeHtml(src)})</span>` : ""}</div><div class="small"><a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a></div>`;
          }
          evList.appendChild(li);
        });
        container.appendChild(evList);
      } else {
        const noEv = document.createElement("div");
        noEv.className = "small";
        noEv.textContent = "No supporting evidence found.";
        container.appendChild(noEv);
      }
      resultsDiv.appendChild(container);
    });
  }

  // --------- Highlight with fuzzy matching ---------
  function highlightFakeText(fakeSentences, tabId) {
    const arr = (fakeSentences || []).map(s => (s || "").trim()).filter(Boolean);
    chrome.scripting.executeScript({
      target: { tabId },
      func: (sentences) => {
        document.querySelectorAll("span.misinfo-highlight").forEach(sp => {
          const parent = sp.parentNode;
          if (parent) parent.replaceChild(document.createTextNode(sp.textContent), sp);
        });

        if (!sentences || sentences.length === 0) return;

        const regexes = sentences.map(s =>
          new RegExp(s.split(" ").slice(0, 5).join(".*?"), "i") // fuzzy
        );

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        textNodes.forEach(node => {
          if (!node.parentNode) return;
          const original = node.nodeValue;
          let replaced = false;

          regexes.forEach(regex => {
            if (regex.test(original)) {
              const span = document.createElement("span");
              span.className = "misinfo-highlight";
              span.style.backgroundColor = "yellow";
              span.style.color = "red";
              span.style.fontWeight = "600";
              span.textContent = original;
              node.parentNode.replaceChild(span, node);
              replaced = true;
            }
          });
          if (replaced) return;
        });
      },
      args: [arr]
    }).catch(err => console.warn("Highlight error:", err));
  }

  // --------- History & Stats ---------
  function saveHistory(entry) {
    chrome.storage.local.get([HISTORY_KEY], data => {
      const existing = data[HISTORY_KEY] || [];
      const newHistory = [entry, ...existing].slice(0, 50);
      chrome.storage.local.set({ [HISTORY_KEY]: newHistory });
    });
  }

  function loadHistory() {
    chrome.storage.local.get([HISTORY_KEY], data => {
      const hist = data[HISTORY_KEY] || [];
      historyList.innerHTML = "";
      if (hist.length === 0) {
        historyList.textContent = "No history yet.";
        return;
      }
      hist.forEach(h => {
        const div = document.createElement("div");
        div.className = "card history-entry";
        div.innerHTML = `<strong>${escapeHtml(h.title || h.url)}</strong><div class="small">${escapeHtml(h.date)} — Fake: ${h.results.length}</div>`;
        div.addEventListener("click", () => {
          renderFakeResults(h.results || []);
          document.querySelector('.tab-btn[data-tab="claims"]').click();
        });
        historyList.appendChild(div);
      });
    });
  }

  clearHistoryBtn.addEventListener("click", () => {
    chrome.storage.local.set({ [HISTORY_KEY]: [] }, () => {
      historyList.innerHTML = "History cleared.";
      updateStatsFromHistory([]);
    });
  });

  function loadStats() {
    chrome.storage.local.get([HISTORY_KEY], data => {
      updateStatsFromHistory(data[HISTORY_KEY] || []);
    });
  }

  function updateStatsFromHistory(hist) {
    let fakeCount = 0;
    let verifiedCount = 0;
    let confSum = 0;
    let confCount = 0;

    hist.forEach(h => {
      (h.results || []).forEach(r => {
        const conf = Number(r.confidence || 0);
        if (["fake", "unverified"].includes((r.label || "").toLowerCase())) {
          fakeCount++;
        } else {
          verifiedCount++;
        }
        if (!isNaN(conf)) {
          confSum += conf;
          confCount++;
        }
      });
    });

    fakeCountEl.textContent = fakeCount;
    verifiedCountEl.textContent = verifiedCount;
    avgConfidenceEl.textContent = confCount ? Math.round((confSum / confCount) * 100) + "%" : "N/A";
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function escapeAttr(s) {
    return (""+s).replace(/"/g,'&quot;').replace(/'/g,"&#39;");
  }

  loadHistory();
  loadStats();
});
