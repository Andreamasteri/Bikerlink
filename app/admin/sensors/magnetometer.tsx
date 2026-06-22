import { SensorScreen } from "@/components/admin/sensors/sensor-screen";

export default function MagnetometerScreen() {
  return (
    <SensorScreen
      def={{
        key: "magnetometer",
        name: "Magnetometer",
        platform: "cross",
        defaultConfig: '{"interval": 500}',
      }}
    />
  );
}
