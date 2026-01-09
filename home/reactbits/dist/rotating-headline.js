const mountNode = document.getElementById("rt-headline");

if (mountNode) {
  const root = createRoot(mountNode);
  root.render(<RotatingHeadline />);
}
