
// Function to save selected category to localStorage
function saveCategory(select) {
    localStorage.setItem('selectedCategory', select.value);
    document.getElementById('filterForm').submit();
}

// Function to reset category in localStorage
function resetCategory() {
    localStorage.removeItem('selectedCategory');
}

// Function to set the selected option on page load
window.onload = function() {
    var selectedCategory = localStorage.getItem('selectedCategory');
    if (selectedCategory) {
        document.getElementById('category').value = selectedCategory;
    }
};