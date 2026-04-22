import { SensorScreen } from "./_sensor-screen";

export default function PedometerScreen() {
  return (
    <SensorScreen
      def={{
        key: "pedometer",
        name: "Pedometer",
        platform: "cross",
        defaultConfig: "{}",
      }}
    />
  );
}
