// overflow di lib/leaflet-bundle-css.ts — parte 2/2 (CSS Leaflet, righe 333-end)
// DO NOT EDIT — rigenerato da: node_modules/leaflet/dist/leaflet.css
export const LEAFLET_CSS_PART2 = `.leaflet-touch .leaflet-bar a:last-child {
        border-bottom-left-radius: 2px;
        border-bottom-right-radius: 2px;
        }

/* zoom control */

.leaflet-control-zoom-in,
.leaflet-control-zoom-out {
        font: bold 18px 'Lucida Console', Monaco, monospace;
        text-indent: 1px;
        }

.leaflet-touch .leaflet-control-zoom-in, .leaflet-touch .leaflet-control-zoom-out  {
        font-size: 22px;
        }


/* layers control */

.leaflet-control-layers {
        box-shadow: 0 1px 5px rgba(0,0,0,0.4);
        background: #fff;
        border-radius: 5px;
        }
.leaflet-control-layers-toggle {
        background-image: url(images/layers.png);
        width: 36px;
        height: 36px;
        }
.leaflet-retina .leaflet-control-layers-toggle {
        background-image: url(images/layers-2x.png);
        background-size: 26px 26px;
        }
.leaflet-touch .leaflet-control-layers-toggle {
        width: 44px;
        height: 44px;
        }
.leaflet-control-layers .leaflet-control-layers-list,
.leaflet-control-layers-expanded .leaflet-control-layers-toggle {
        display: none;
        }
.leaflet-control-layers-expanded .leaflet-control-layers-list {
        display: block;
        position: relative;
        }
.leaflet-control-layers-expanded {
        padding: 6px 10px 6px 6px;
        color: #333;
        background: #fff;
        }
.leaflet-control-layers-scrollbar {
        overflow-y: scroll;
        overflow-x: hidden;
        padding-right: 5px;
        }
.leaflet-control-layers-selector {
        margin-top: 2px;
        position: relative;
        top: 1px;
        }
.leaflet-control-layers label {
        display: block;
        font-size: 13px;
        font-size: 1.08333em;
        }
.leaflet-control-layers-separator {
        height: 0;
        border-top: 1px solid #ddd;
        margin: 5px -10px 5px -6px;
        }

/* Default icon URLs */
.leaflet-default-icon-path { /* used only in path-guessing heuristic, see L.Icon.Default */
        background-image: url(images/marker-icon.png);
        }


/* attribution and scale controls */

.leaflet-container .leaflet-control-attribution {
        background: #fff;
        background: rgba(255, 255, 255, 0.8);
        margin: 0;
        }
.leaflet-control-attribution,
.leaflet-control-scale-line {
        padding: 0 5px;
        color: #333;
        line-height: 1.4;
        }
.leaflet-control-attribution a {
        text-decoration: none;
        }
.leaflet-control-attribution a:hover,
.leaflet-control-attribution a:focus {
        text-decoration: underline;
        }
.leaflet-attribution-flag {
        display: inline !important;
        vertical-align: baseline !important;
        width: 1em;
        height: 0.6669em;
        }
.leaflet-left .leaflet-control-scale {
        margin-left: 5px;
        }
.leaflet-bottom .leaflet-control-scale {
        margin-bottom: 5px;
        }
.leaflet-control-scale-line {
        border: 2px solid #777;
        border-top: none;
        line-height: 1.1;
        padding: 2px 5px 1px;
        white-space: nowrap;
        -moz-box-sizing: border-box;
             box-sizing: border-box;
        background: rgba(255, 255, 255, 0.8);
        text-shadow: 1px 1px #fff;
        }
.leaflet-control-scale-line:not(:first-child) {
        border-top: 2px solid #777;
        border-bottom: none;
        margin-top: -2px;
        }
.leaflet-control-scale-line:not(:first-child):not(:last-child) {
        border-bottom: 2px solid #777;
        }

.leaflet-touch .leaflet-control-attribution,
.leaflet-touch .leaflet-control-layers,
.leaflet-touch .leaflet-bar {
        box-shadow: none;
        }
.leaflet-touch .leaflet-control-layers,
.leaflet-touch .leaflet-bar {
        border: 2px solid rgba(0,0,0,0.2);
        background-clip: padding-box;
        }


/* popup */

.leaflet-popup {
        position: absolute;
        text-align: center;
        margin-bottom: 20px;
        }
.leaflet-popup-content-wrapper {
        padding: 1px;
        text-align: left;
        border-radius: 12px;
        }
.leaflet-popup-content {
        margin: 13px 24px 13px 20px;
        line-height: 1.3;
        font-size: 13px;
        font-size: 1.08333em;
        min-height: 1px;
        }
.leaflet-popup-content p {
        margin: 17px 0;
        margin: 1.3em 0;
        }
.leaflet-popup-tip-container {
        width: 40px;
        height: 20px;
        position: absolute;
        left: 50%;
        margin-top: -1px;
        margin-left: -20px;
        overflow: hidden;
        pointer-events: none;
        }
.leaflet-popup-tip {
        width: 17px;
        height: 17px;
        padding: 1px;

        margin: -10px auto 0;
        pointer-events: auto;

        -webkit-transform: rotate(45deg);
           -moz-transform: rotate(45deg);
            -ms-transform: rotate(45deg);
                transform: rotate(45deg);
        }
.leaflet-popup-content-wrapper,
.leaflet-popup-tip {
        background: white;
        color: #333;
        box-shadow: 0 3px 14px rgba(0,0,0,0.4);
        }
.leaflet-container a.leaflet-popup-close-button {
        position: absolute;
        top: 0;
        right: 0;
        border: none;
        text-align: center;
        width: 24px;
        height: 24px;
        font: 16px/24px Tahoma, Verdana, sans-serif;
        color: #757575;
        text-decoration: none;
        background: transparent;
        }
.leaflet-container a.leaflet-popup-close-button:hover,
.leaflet-container a.leaflet-popup-close-button:focus {
        color: #585858;
        }
.leaflet-popup-scrolled {
        overflow: auto;
        }

.leaflet-oldie .leaflet-popup-content-wrapper {
        -ms-zoom: 1;
        }
.leaflet-oldie .leaflet-popup-tip {
        width: 24px;
        margin: 0 auto;

        -ms-filter: "progid:DXImageTransform.Microsoft.Matrix(M11=0.70710678, M12=0.70710678, M21=-0.70710678, M22=0.70710678)";
        filter: progid:DXImageTransform.Microsoft.Matrix(M11=0.70710678, M12=0.70710678, M21=-0.70710678, M22=0.70710678);
        }

.leaflet-oldie .leaflet-control-zoom,
.leaflet-oldie .leaflet-control-layers,
.leaflet-oldie .leaflet-popup-content-wrapper,
.leaflet-oldie .leaflet-popup-tip {
        border: 1px solid #999;
        }


/* div icon */

.leaflet-div-icon {
        background: #fff;
        border: 1px solid #666;
        }


/* Tooltip */
/* Base styles for the element that has a tooltip */
.leaflet-tooltip {
        position: absolute;
        padding: 6px;
        background-color: #fff;
        border: 1px solid #fff;
        border-radius: 3px;
        color: #222;
        white-space: nowrap;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
        pointer-events: none;
        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
.leaflet-tooltip.leaflet-interactive {
        cursor: pointer;
        pointer-events: auto;
        }
.leaflet-tooltip-top:before,
.leaflet-tooltip-bottom:before,
.leaflet-tooltip-left:before,
.leaflet-tooltip-right:before {
        position: absolute;
        pointer-events: none;
        border: 6px solid transparent;
        background: transparent;
        content: "";
        }

/* Directions */

.leaflet-tooltip-bottom {
        margin-top: 6px;
}
.leaflet-tooltip-top {
        margin-top: -6px;
}
.leaflet-tooltip-bottom:before,
.leaflet-tooltip-top:before {
        left: 50%;
        margin-left: -6px;
        }
.leaflet-tooltip-top:before {
        bottom: 0;
        margin-bottom: -12px;
        border-top-color: #fff;
        }
.leaflet-tooltip-bottom:before {
        top: 0;
        margin-top: -12px;
        margin-left: -6px;
        border-bottom-color: #fff;
        }
.leaflet-tooltip-left {
        margin-left: -6px;
}
.leaflet-tooltip-right {
        margin-left: 6px;
}
.leaflet-tooltip-left:before,
.leaflet-tooltip-right:before {
        top: 50%;
        margin-top: -6px;
        }
.leaflet-tooltip-left:before {
        right: 0;
        margin-right: -12px;
        border-left-color: #fff;
        }
.leaflet-tooltip-right:before {
        left: 0;
        margin-left: -12px;
        border-right-color: #fff;
        }

/* Printing */

@media print {
        /* Prevent printers from removing background-images of controls. */
        .leaflet-control {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                }
        }
`;
