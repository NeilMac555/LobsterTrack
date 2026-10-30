async function loadManagerRatings(data) { return data; }
function setupManagerAccess(data) {
  const previousDate = data.movement_as_of ? new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(data.movement_as_of.slice(0,10)+'T00:00:00Z')) : null;
  document.getElementById('movement-note').textContent = previousDate ? `Arrows show places gained or lost in the overall ranking since ${previousDate}. They stay on that basis when you sort or filter. New = newly qualified; — = unchanged or unavailable (see tooltip).` : 'Rank movement will appear after the next update.';
  document.getElementById('manager-access-label').textContent = 'Free access · All manager ratings';
}
