/* ── Campus Themes for Demo Mode ──
   secondaryColor     = official accent/gold/grey
   secondaryTextColor = text color to place ON TOP of secondaryColor for contrast
*/
var CAMPUS_THEMES = {
  usc: {
    orgName: 'USC DART', orgShortName: 'DART',
    orgTagline: 'Disabled Access to Road Transportation', orgInitials: 'DT',
    primaryColor: '#990000', primaryLight: '#B83A4B', primaryDark: '#740000',
    secondaryColor: '#FFCC00', secondaryTextColor: '#990000',
    sidebarBg: '#1A0000', sidebarText: '#C4A3A3',
    sidebarActiveBg: 'rgba(153,0,0,0.25)', sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)', mapUrl: 'https://maps.usc.edu/', campusKey: 'usc'
  },
  stanford: {
    orgName: 'Stanford ATS', orgShortName: 'ATS',
    orgTagline: 'Accessible Transportation Service', orgInitials: 'AT',
    primaryColor: '#8C1515', primaryLight: '#B83A4B', primaryDark: '#820000',
    secondaryColor: '#53565A', secondaryTextColor: '#FFFFFF',
    sidebarBg: '#1A0505', sidebarText: '#C4A8A8',
    sidebarActiveBg: 'rgba(140,21,21,0.25)', sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)', mapUrl: 'https://campus-map.stanford.edu/', campusKey: 'stanford'
  },
  ucla: {
    orgName: 'UCLA BruinAccess', orgShortName: 'BruinAccess',
    orgTagline: 'Accessible Campus Transportation', orgInitials: 'BA',
    primaryColor: '#2774AE', primaryLight: '#5A9FD4', primaryDark: '#025D8D',
    secondaryColor: '#FFD100', secondaryTextColor: '#2774AE',
    sidebarBg: '#0D1B2A', sidebarText: '#8FAFC8',
    sidebarActiveBg: 'rgba(39,116,174,0.25)', sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)', mapUrl: 'https://map.ucla.edu/', campusKey: 'ucla'
  },
  uci: {
    orgName: 'UCI AnteaterExpress', orgShortName: 'AntExpress',
    orgTagline: 'Accessible Campus Transportation', orgInitials: 'AE',
    primaryColor: '#255799', primaryLight: '#5580BB', primaryDark: '#1A3D70',
    secondaryColor: '#FECC07', secondaryTextColor: '#255799',
    sidebarBg: '#001A2E', sidebarText: '#7BAAC4',
    sidebarActiveBg: 'rgba(37,87,153,0.25)', sidebarHover: 'rgba(255,255,255,0.06)',
    sidebarBorder: 'rgba(255,255,255,0.08)', mapUrl: 'https://map.uci.edu/', campusKey: 'uci'
  }
};
