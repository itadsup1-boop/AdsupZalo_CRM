export function getVietnamTime(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  
  return {
    year: parseInt(map.year),
    month: parseInt(map.month),
    day: parseInt(map.day),
    hour: parseInt(map.hour),
    minute: parseInt(map.minute)
  };
}

export function formatMessageTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  
  const tzDate = getVietnamTime(date);
  const tzNow = getVietnamTime(now);
  
  const hourStr = String(tzDate.hour).padStart(2, '0');
  const minuteStr = String(tzDate.minute).padStart(2, '0');
  const timeStr = `${hourStr}:${minuteStr}`;
  
  const targetMidnight = new Date(Date.UTC(tzDate.year, tzDate.month - 1, tzDate.day));
  const nowMidnight = new Date(Date.UTC(tzNow.year, tzNow.month - 1, tzNow.day));
  
  const diffTime = nowMidnight.getTime() - targetMidnight.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return timeStr;
  } else if (diffDays === 1) {
    return `Hôm qua, ${timeStr}`;
  } else if (tzDate.year === tzNow.year) {
    const dayStr = String(tzDate.day).padStart(2, '0');
    const monthStr = String(tzDate.month).padStart(2, '0');
    return `${dayStr}/${monthStr}, ${timeStr}`;
  } else {
    const dayStr = String(tzDate.day).padStart(2, '0');
    const monthStr = String(tzDate.month).padStart(2, '0');
    return `${dayStr}/${monthStr}/${tzDate.year}, ${timeStr}`;
  }
}

export function formatSeparatorDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  const tzDate = getVietnamTime(date);
  const tzNow = getVietnamTime(now);
  
  const targetMidnight = new Date(Date.UTC(tzDate.year, tzDate.month - 1, tzDate.day));
  const nowMidnight = new Date(Date.UTC(tzNow.year, tzNow.month - 1, tzNow.day));
  
  const diffTime = nowMidnight.getTime() - targetMidnight.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Hôm nay';
  } else if (diffDays === 1) {
    return 'Hôm qua';
  } else {
    const dayStr = String(tzDate.day).padStart(2, '0');
    const monthStr = String(tzDate.month).padStart(2, '0');
    return `${dayStr}/${monthStr}/${tzDate.year}`;
  }
}
