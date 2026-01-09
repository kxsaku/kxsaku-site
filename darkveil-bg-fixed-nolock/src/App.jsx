import DarkVeil from "./DarkVeil";

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <DarkVeil
        hueShift={0}
        noiseIntensity={0}
        scanlineIntensity={0.35}
        speed={0.5}
        scanlineFrequency={36}
        warpAmount={0.2}
        resolutionScale={1.5}
      />
    </div>
  );
}
