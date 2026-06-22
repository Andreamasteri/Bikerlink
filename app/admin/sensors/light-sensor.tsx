import { SensorScreen } from "@/components/admin/sensors/sensor-screen";

export default function LightSensorScreen() {
  return (
    <SensorScreen
      def={{
        key: "lightSensor",
        name: "LightSensor",
        platform: "android",
        defaultConfig: '{"interval": 500}',
      }}
    />
  );
}
