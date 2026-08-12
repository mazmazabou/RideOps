/* ── Campus Themes for Demo Mode ──
   secondaryColor     = official accent/gold/grey
   secondaryTextColor = text color to place ON TOP of secondaryColor for contrast
*/
var DEFAULT_HEADER_BG = '#D4E3F0'; // steelblue 20% tint — darker for contrast

var CAMPUS_THEMES = {
  usc: {
    orgName: 'USC DART', orgShortName: 'DART',
    orgTagline: 'Disabled Access to Road Transportation', orgInitials: 'DT',
    primaryColor: '#990000', primaryLight: '#B83A4B', primaryDark: '#740000',
    secondaryColor: '#FFCC00', secondaryTextColor: '#990000',
    sidebarBg: '#1A0000', sidebarText: '#C4A3A3',
    sidebarActiveBg: 'rgba(153,0,0,0.25)', sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)', mapUrl: 'https://maps.usc.edu/', campusKey: 'usc',
    headerBg: '#FFE8A0'  // Gold 35% tint — deeper gold, cardinal text pops
  },
  stanford: {
    orgName: 'Stanford ATS', orgShortName: 'ATS',
    orgTagline: 'Accessible Transportation Service', orgInitials: 'AT',
    primaryColor: '#8C1515', primaryLight: '#B83A4B', primaryDark: '#820000',
    secondaryColor: '#B6B1A9', secondaryTextColor: '#8C1515',
    sidebarBg: '#1A0505', sidebarText: '#C4A8A8',
    sidebarActiveBg: 'rgba(140,21,21,0.25)', sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)', mapUrl: 'https://campus-map.stanford.edu/', campusKey: 'stanford',
    headerBg: '#EDE8E3'  // Sandstone tint — warm Stanford feel, cardinal pops
  },
  ucla: {
    orgName: 'UCLA BruinAccess', orgShortName: 'BruinAccess',
    orgTagline: 'Accessible Campus Transportation', orgInitials: 'BA',
    primaryColor: '#2774AE', primaryLight: '#5A9FD4', primaryDark: '#025D8D',
    secondaryColor: '#FFD100', secondaryTextColor: '#2774AE',
    sidebarBg: '#0D1B2A', sidebarText: '#8FAFC8',
    sidebarActiveBg: 'rgba(39,116,174,0.25)', sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)', mapUrl: 'https://map.ucla.edu/', campusKey: 'ucla',
    headerBg: '#C2DBFA'  // UCLA Blue 25% tint — stronger blue, good contrast
  },
  uci: {
    orgName: 'UCI AnteaterExpress', orgShortName: 'AntExpress',
    orgTagline: 'Accessible Campus Transportation', orgInitials: 'AE',
    primaryColor: '#0064A4', primaryLight: '#3388C0', primaryDark: '#004B7A',
    secondaryColor: '#FFD200', secondaryTextColor: '#255799',
    sidebarBg: '#001A2E', sidebarText: '#7BAAC4',
    sidebarActiveBg: 'rgba(0,100,164,0.25)', sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)', mapUrl: 'https://map.uci.edu/', campusKey: 'uci',
    headerBg: '#D0DEF0'  // UCI Blue 20% tint — richer blue, better contrast
  },
  scranton: {
    orgName: 'Royal Ride', orgShortName: 'Royal Ride',
    orgTagline: 'University of Scranton Campus Transportation', orgInitials: 'RR',
    primaryColor: '#512D6D', primaryLight: '#6B4390', primaryDark: '#3E2159',
    secondaryColor: '#EA7A59', secondaryTextColor: '#512D6D',
    sidebarBg: '#1C1129', sidebarText: '#A99BC4',
    sidebarActiveBg: 'rgba(81,45,109,0.35)', sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)', mapUrl: 'https://admissions.scranton.edu/our-campus/campus-maps.shtml', campusKey: 'scranton',
    headerBg: '#EBE3F2'  // Scranton Purple (PMS 269) 15% tint
  }
};

/**
 * Returns an ordered array of hex colors for the current campus,
 * suitable for chart fills, schedule grid columns, and categorical pills.
 * Status colors (pending/approved/completed/no_show etc.) are handled
 * separately by CSS variables and are NOT part of this palette.
 *
 * @param {string} campusKey  — 'usc' | 'stanford' | 'ucla' | 'uci' | 'scranton' | null
 * @returns {string[]}        — array of hex color strings, 6–10 colors
 */
function getCampusPalette(campusKey) {
  switch (campusKey) {

    case 'scranton':
      // Scranton purple (PMS 269) family with warm orange web-accent.
      // Dark → light purples for schedule columns; orange/coral for warm
      // accents; cool gray and plum for outliers.
      return [
        '#2A1740',  // Darkest Purple
        '#3E2159',  // Dark Purple
        '#512D6D',  // Scranton Purple (PMS 269)
        '#6B4390',  // Medium Purple
        '#8A65AD',  // Light Purple
        '#B79BD1',  // Lighter Purple
        '#EA7A59',  // Orange (web accent)
        '#C4552F',  // Dark Orange
        '#8E9BAE',  // Cool Gray
        '#4A3A5E',  // Muted Plum
      ];

    case 'usc':
      // Darkened tertiary palette — washed-out lime, peach, yellow replaced.
      return [
        '#2B5597',  // Blue (PMS 7685)
        '#E43D30',  // Red-Orange (PMS 179)
        '#FF9015',  // Orange (PMS 1495)
        '#908C13',  // Olive (PMS 582) — replaces bright lime
        '#F26178',  // Pink-Red (PMS 709)
        '#740000',  // Cardinal Dark
        '#CC7A00',  // Darkened gold — replaces bright yellow
        '#B05A00',  // Deep burnt orange — replaces peach
      ];

    case 'stanford':
      // Landmark accent palette. Cool blue-green progression first,
      // then warm tones. All 14 named accents, lightest to darkest per group.
      // Digital interactive colors included at end for UI-safe use.
      return [
        '#4298B5',  // Sky
        '#007C92',  // Lagunita
        '#279989',  // Palo Verde
        '#175E54',  // Palo Alto
        '#6FA287',  // Bay
        '#8F993E',  // Olive
        '#E98300',  // Poppy
        '#E04F39',  // Spirited
        '#FEDD5C',  // Illuminating
        '#620059',  // Plum
        '#651C32',  // Brick
        '#5D4B3C',  // Archway
        '#7F7776',  // Stone
        '#DAD7CB',  // Fog
      ];

    case 'ucla':
      // Blue tone range first (schedule grids, multi-driver charts),
      // then gold tones (highlights, secondary fills).
      return [
        '#003B5C',  // Darkest Blue
        '#005587',  // Darker Blue
        '#2774AE',  // UCLA Blue
        '#8BB8E8',  // Lighter Blue
        '#DAEBFE',  // Lightest Blue
        '#FFB81C',  // Darkest Gold
        '#FFC72C',  // Darker Gold
        '#FFD100',  // UCLA Gold
      ];

    case 'uci':
      // Richest palette of the four. Blue → teal → turquoise for schedule
      // columns; orange and gold for warm accents; accents for outliers.
      return [
        '#002244',  // Darkest Blue
        '#1B3D6D',  // Dark Blue
        '#0083B3',  // Teal Blue
        '#00B0CA',  // Turquoise
        '#F78D2D',  // Orange
        '#F0AB00',  // Deep Gold
        '#3F9C35',  // Green
        '#7AB800',  // Lime Green
        '#6AA2B8',  // Light Blue
        '#7C109A',  // Bright Purple
      ];

    default:
      // RideOps platform defaults — steelblue family + neutrals
      return [
        '#4682B4',  // Steel Blue (primary)
        '#36648B',  // Steel Blue Dark
        '#B0C4DE',  // Steel Blue Light
        '#D2B48C',  // Tan
        '#C4A067',  // Tan Dark
        '#8FAF9F',  // Sage
        '#7A9DBF',  // Dusty Blue
        '#BFA98A',  // Warm Sand
      ];
  }
}
