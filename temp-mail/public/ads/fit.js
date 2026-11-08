(() => {
  const width = window.atOptions.width;
  document.body.style.width = `${width}px`;
  document.body.style.transformOrigin = "top left";
  // Resize the existing creative without requesting another impression.
  const fit = () => { document.body.style.transform = `scale(${Math.min(1, window.innerWidth / width)})`; };
  fit();
  window.addEventListener("resize", fit);
})();
