export const COMMON_SCRIPTS = `
function bearing(p1, p2) {
  var dLng = (p2.lng - p1.lng) * Math.PI / 180;
  var lat1 = p1.lat * Math.PI / 180;
  var lat2 = p2.lat * Math.PI / 180;
  var y = Math.sin(dLng) * Math.cos(lat2);
  var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x) * 180 / Math.PI;
}

function angleDiff(a, b) {
  var d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function curvatureColor(angle) {
  var t = Math.min(1, angle / 90);
  if (t < 0.33) {
    var s = t / 0.33;
    return "rgb(" + Math.round(34 + s*(234-34)) + "," + Math.round(197 + s*(179-197)) + ",58)";
  } else if (t < 0.66) {
    var s2 = (t - 0.33) / 0.33;
    return "rgb(" + Math.round(234 + s2*(249-234)) + "," + Math.round(179 + s2*(115-179)) + ",0)";
  } else {
    var s3 = (t - 0.66) / 0.34;
    return "rgb(" + Math.round(249 + s3*(239-249)) + "," + Math.round(115 + s3*(68-115)) + ",68)";
  }
}

function postMsg(data) {
  try {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    } else {
      window.postMessage(JSON.stringify(data), window.location.origin);
    }
  } catch(e) {}
}

function destPoint(lat, lng, bearingDeg, distKm) {
  var R = 6371;
  var d = distKm / R;
  var brng = bearingDeg * Math.PI / 180;
  var lat1 = lat * Math.PI / 180;
  var lng1 = lng * Math.PI / 180;
  var lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(brng));
  var lng2 = lng1 + Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(lat1), Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
  return [lat2 * 180/Math.PI, lng2 * 180/Math.PI];
}
`;
