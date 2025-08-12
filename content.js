init();

function init() {
  console.log("init");
}

function highlightKeywords(keywords) {
  console.log("Highlighting keywords:", keywords);
}

function removeHighlights() {
  console.log("Removing highlights");
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "updateHighlights") {
    console.log("Updating highlights");
  }
});
