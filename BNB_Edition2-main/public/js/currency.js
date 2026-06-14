let currentCurrency = "INR";
const exchangeRates = {
  INR: 1,
  USD: 0.012,
};

document.addEventListener("DOMContentLoaded", function () {
  const savedCurrency = localStorage.getItem("preferredCurrency");
  if (savedCurrency && exchangeRates[savedCurrency]) {
    currentCurrency = savedCurrency;
    updateCurrencyDisplay();
    convertAllAmounts();
  }
});

function toggleCurrency() {
  currentCurrency = currentCurrency === "INR" ? "USD" : "INR";

  localStorage.setItem("preferredCurrency", currentCurrency);

  updateCurrencyDisplay();
  convertAllAmounts();
}

function updateCurrencyDisplay() {
  const symbolElement = document.getElementById("currencySymbol");
  const codeElement = document.getElementById("currencyCode");

  if (symbolElement && codeElement) {
    if (currentCurrency === "INR") {
      symbolElement.textContent = "₹";
      codeElement.textContent = "INR";
    } else {
      symbolElement.textContent = "$";
      codeElement.textContent = "USD";
    }
  }
}

function convertAmount(amount, fromCurrency = "INR") {
  if (fromCurrency === currentCurrency) {
    return amount;
  }

  if (fromCurrency === "INR" && currentCurrency === "USD") {
    return Math.round(amount * exchangeRates.USD * 100) / 100;
  } else if (fromCurrency === "USD" && currentCurrency === "INR") {
    return Math.round(amount / exchangeRates.USD);
  }

  return amount;
}

function getCurrencySymbol() {
  return currentCurrency === "INR" ? "₹" : "$";
}

function convertAllAmounts() {
  const amountElements = document.querySelectorAll("[data-amount]");

  amountElements.forEach((element) => {
    const originalAmount = parseFloat(element.getAttribute("data-amount"));
    const convertedAmount = convertAmount(originalAmount);
    const symbol = getCurrencySymbol();

    element.textContent = `${symbol}${convertedAmount.toLocaleString()}`;
  });

  const displayElements = document.querySelectorAll(".amount-display");
  displayElements.forEach((element) => {
    const text = element.textContent;
    const amountMatch = text.match(/₹(\d+(?:,\d{3})*(?:\.\d{2})?)/);

    if (amountMatch) {
      const originalAmount = parseFloat(amountMatch[1].replace(/,/g, ""));
      const convertedAmount = convertAmount(originalAmount);
      const symbol = getCurrencySymbol();

      element.textContent = text.replace(
        /₹\d+(?:,\d{3})*(?:\.\d{2})?/,
        `${symbol}${convertedAmount.toLocaleString()}`
      );
    }
  });
}

function formatAmount(amount, fromCurrency = "INR") {
  const convertedAmount = convertAmount(amount, fromCurrency);
  const symbol = getCurrencySymbol();
  return `${symbol}${convertedAmount.toLocaleString()}`;
}

window.currencyUtils = {
  toggleCurrency,
  convertAmount,
  getCurrencySymbol,
  formatAmount,
  getCurrentCurrency: () => currentCurrency,
};
