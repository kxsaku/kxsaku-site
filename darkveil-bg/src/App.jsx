import DarkVeil from "./DarkVeil";

export default function App() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#000",
      }}
    >
      <DarkVeil
        speed={1.3}
        hueShift={0}
        noiseIntensity={0}
        scanlineIntensity={0.35}
        scanlineFrequency={36}
        warpAmount={0.2}
        resolutionScale={1.5}
      />
    </div>
  );
}
