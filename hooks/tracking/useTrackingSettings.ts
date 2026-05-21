import { useState, useRef } from "react";
import { UpdateProfile } from "../../components/tracking/tracking-utils";

export function useTrackingSettings() {
  const [profile, setProfile] = useState<UpdateProfile>("medium");
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [countdownSec, setCountdownSec] = useState("10");
  const [handsOffEnabled, setHandsOffEnabled] = useState(false);
  const [handsOffSpeedStr, setHandsOffSpeedStr] = useState("50");
  const [is0100Enabled, setIs0100Enabled] = useState(false);
  const [showMyRoute, setShowMyRoute] = useState(true);
  const [sensorsEnabled, setSensorsEnabled] = useState(false);
  const [showMountCalibWizard, setShowMountCalibWizard] = useState(false);

  const profileRef = useRef<UpdateProfile>("medium");
  const handsOffEnabledRef = useRef(false);
  const handsOffSpeedRef = useRef(50);
  const is0100EnabledRef = useRef(false);
  const sensorsEnabledRef = useRef(false);

  return {
    profile,
    setProfile,
    countdownEnabled,
    setCountdownEnabled,
    countdownSec,
    setCountdownSec,
    handsOffEnabled,
    setHandsOffEnabled,
    handsOffSpeedStr,
    setHandsOffSpeedStr,
    is0100Enabled,
    setIs0100Enabled,
    showMyRoute,
    setShowMyRoute,
    sensorsEnabled,
    setSensorsEnabled,
    showMountCalibWizard,
    setShowMountCalibWizard,
    profileRef,
    handsOffEnabledRef,
    handsOffSpeedRef,
    is0100EnabledRef,
    sensorsEnabledRef,
  };
}
