const React = require("react");
const { View } = require("react-native");

const MapView = (props) => React.createElement(View, props);
MapView.displayName = "MapView";

const Marker = (props) => React.createElement(View, props);
Marker.displayName = "Marker";

module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Marker;
