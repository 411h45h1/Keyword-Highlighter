// Popup script for Advanced Keyword Highlighter

document.addEventListener('DOMContentLoaded', function() {
  // Get DOM elements
  const keywordInput = document.getElementById('keyword');
  const addButton = document.getElementById('add');
  const keywordsList = document.getElementById('keywords');

  // Load existing keywords when popup opens
  loadKeywords();

  // Add event listeners
  addButton.addEventListener('click', addKeyword);

  function addKeyword() {
    // TODO: Implement add keyword functionality
    const keyword = keywordInput.value.trim();
    console.log('Adding keyword:', keyword);
    
    // Save to storage
    // Update display
    // Clear input
  }

  function loadKeywords() {
    // TODO: Load keywords from storage and display them
    console.log('Loading keywords...');
  }

  function removeKeyword(keyword) {
    // TODO: Remove keyword from storage and update display
    console.log('Removing keyword:', keyword);
  }
});
