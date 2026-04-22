import { SensorScreen } from "./_sensor-screen";

export default function BarometerScreen() {
  return (
    <SensorScreen
      def={{
        key: "barometer",
        name: "Barometer",
        platform: "cross",
        defaultConfig: '{"interval": 500}',
      }}
    />
  );
}
