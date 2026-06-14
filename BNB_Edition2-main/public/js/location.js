let userLocation = {
  state: "",
  city: "",
};

window.addEventListener("DOMContentLoaded", () => {
  initializeLocation();
  setupEventListeners();
});

async function initializeLocation() {
  const stateSelect = document.getElementById("stateSelect");
  const citySelect = document.getElementById("citySelect");

  const urlParams = new URLSearchParams(window.location.search);
  const selectedState = urlParams.get("state");
  const selectedCity = urlParams.get("city");

  if (selectedState) {
    userLocation.state = selectedState;
  } else {
    userLocation.state = "Karnataka";

    if (stateSelect) {
      Array.from(stateSelect.options).forEach((option) => {
        if (option.text === "Karnataka") {
          option.selected = true;
        }
      });
    }
  }
}

function setupEventListeners() {
  const stateSelect = document.getElementById("stateSelect");
  const citySelect = document.getElementById("citySelect");
  const searchInput = document.getElementById("searchInput");

  if (stateSelect) {
    stateSelect.addEventListener("change", function () {
      userLocation.state = this.value;
      if (citySelect) {
        citySelect.value = "";
        userLocation.city = "";
      }
    });
  }

  if (citySelect) {
    citySelect.addEventListener("change", function () {
      userLocation.city = this.value;
    });
  }

  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener("input", function () {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        document.getElementById("searchForm").submit();
      }, 2000);
    });
  }
}

function clearFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("stateSelect").value = "";
  document.getElementById("citySelect").value = "";
  document.querySelector('select[name="department"]').value = "";
  document.querySelector('select[name="status"]').value = "";

  userLocation.state = "";
  userLocation.city = "";

  window.location.href = "/";
}
