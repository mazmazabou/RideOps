export default function RideChip({ ride, offset, onClick }) {
  const time = ride.requestedTime
    ? new Date(ride.requestedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const pickup = ride.pickupLocation
    ? ride.pickupLocation.trim().toUpperCase()
    : '';

  return (
    <span
      className={`ride-chip status-${ride.status}${offset === 'mid' ? ' offset-mid' : ''} cursor-pointer`}
      onClick={() => onClick(ride)}
    >
      <span>{ride.riderName || '\u2014'}</span>
      <span className="time">{time}</span>
      <span className="small-text">{pickup}</span>
    </span>
  );
}
