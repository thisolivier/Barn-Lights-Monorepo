export async function fetchPresetNames(win){
  const res = await win.fetch('/presets');
  return res.json();
}

export function populatePresetDropdown(doc, selectEl, names){
  selectEl.innerHTML = '';
  names.forEach(n => {
    const opt = doc.createElement('option');
    opt.value = n;
    opt.textContent = n;
    selectEl.appendChild(opt);
  });
}

export async function refreshPresetDropdown(win, doc, selectEl){
  const names = await fetchPresetNames(win);
  populatePresetDropdown(doc, selectEl, names);
  return names;
}
