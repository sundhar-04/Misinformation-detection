// // content.js

// // Function to check page for misinformation
// async function checkPageForMisinformation() {
//     const text = document.body.innerText;
  
//     try {
//       const response = await fetch("http://127.0.0.1:8000/verify", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ claim: text })  // backend expects "claim"
//       });
  
//       const data = await response.json();
  
//       if (data && data.claim) {
//         // Split claim into sentences (simple split by period, can improve later)
//         const sentences = data.claim.split(/(?<=[.?!])\s+/);
  
//         sentences.forEach(sentence => {
//           sentence = sentence.trim();
//           if (sentence.length > 5) {
//             highlightText(sentence);
//           }
//         });
//       }
//     } catch (err) {
//       console.error("❌ Backend fetch failed:", err);
//     }
//   }
  
//   // Function to highlight a sentence in the DOM
//   function highlightText(sentence) {
//     const regex = new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  
//     const walker = document.createTreeWalker(
//       document.body,
//       NodeFilter.SHOW_TEXT,
//       null,
//       false
//     );
  
//     let node;
//     const nodesToReplace = [];
  
//     while ((node = walker.nextNode())) {
//       if (regex.test(node.nodeValue)) {
//         nodesToReplace.push(node);
//       }
//     }
  
//     nodesToReplace.forEach(node => {
//       const frag = document.createDocumentFragment();
//       let lastIndex = 0;
//       const matches = [...node.nodeValue.matchAll(regex)];
  
//       matches.forEach(match => {
//         frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, match.index)));
  
//         const span = document.createElement("span");
//         span.textContent = match[0];
//         span.style.backgroundColor = "red";
//         span.style.color = "white";
//         span.style.fontWeight = "bold";
//         frag.appendChild(span);
  
//         lastIndex = match.index + match[0].length;
//       });
  
//       frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)));
//       node.parentNode.replaceChild(frag, node);
//     });
//   }
  
//   // Run the check when the page loads
//   checkPageForMisinformation();
  
// content.js

// Get all visible text nodes on the page
function getTextNodes() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node) {
            // Ignore empty or whitespace-only nodes
            if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const nodes = [];
    while(walker.nextNode()) {
        nodes.push(walker.currentNode);
    }
    return nodes;
}

// Highlight fake sentence
function highlightSentence(sentence) {
    const regex = new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    document.body.innerHTML = document.body.innerHTML.replace(regex, (match) => {
        return `<span style="background-color: rgba(255,0,0,0.3); color: black;">${match}</span>`;
    });
}

// Send page text to API
async function checkPage() {
    const nodes = getTextNodes();
    const text = nodes.map(n => n.nodeValue).join(' ');

    try {
        const response = await fetch("http://127.0.0.1:8000/verify-page", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ text })
        });

        const data = await response.json();
        if (data.results && data.results.length) {
            data.results.forEach(result => {
                if (result.label === "Unverified") {
                    highlightSentence(result.sentence);
                }
            });
        }
    } catch (err) {
        console.error("Error verifying page:", err);
    }
}

// Run after page loads
window.addEventListener("load", () => {
    checkPage();
});
