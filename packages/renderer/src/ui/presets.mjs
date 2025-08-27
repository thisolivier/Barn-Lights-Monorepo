export async function fetchPresetNames(win){
  const res = await win.fetch('/presets');
  return res.json();
}

export function renderPresetList(doc, container, names, onSelect){
  container.innerHTML = '';
  names.forEach(n => {
    const item = doc.createElement('div');
    item.className = 'presetItem';
    const img = doc.createElement('img');
    img.src = `/preset/preview/${encodeURIComponent(n)}`;
    img.alt = n;
    item.appendChild(img);
    const label = doc.createElement('div');
    label.textContent = n;
    item.appendChild(label);
    item.onclick = () => onSelect(n);
    container.appendChild(item);
  });
}

export async function refreshPresetPanel(win, doc, container, onSelect){
  const names = await fetchPresetNames(win);
  renderPresetList(doc, container, names, onSelect);
  return names;
}
