const input = document.getElementById("apikey");
const saveBtn = document.getElementById("save");
const savedIndicator = document.getElementById("saved");

(async function load() {
  const { apiKey } = await chrome.storage.local.get(["apiKey"]);
  if (apiKey) input.value = apiKey;
})();

saveBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ apiKey: input.value.trim() });
  savedIndicator.classList.add("visible");
  setTimeout(() => savedIndicator.classList.remove("visible"), 1500);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});
