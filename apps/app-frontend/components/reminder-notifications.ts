import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { RecordRow } from '@pharmalert/shared';

export async function clearDoseAlerts() {
  const alerts=await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(alerts.filter(alert=>alert.content.data?.pharmalertDose===true).map(alert=>Notifications.cancelScheduledNotificationAsync(alert.identifier)));
}
export async function scheduleDoseAlerts(rows:RecordRow[]) {
  if(Platform.OS==='android') await Notifications.setNotificationChannelAsync('doses',{name:'Medication reminders',importance:Notifications.AndroidImportance.DEFAULT});
  const current=await Notifications.getPermissionsAsync();
  if(!current.granted && !(await Notifications.requestPermissionsAsync()).granted) throw new Error('Notification permission is disabled on this device.');
  await clearDoseAlerts();
  const upcoming=rows.filter(row=>Date.parse(String(row.scheduled_at))>Date.now()).sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at))).slice(0,32);
  for(const row of upcoming) {
    await Notifications.scheduleNotificationAsync({
      content:{title:'Medication reminder',body:'Open PharmAlert to review your scheduled dose.',data:{pharmalertDose:true}},
      trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(String(row.scheduled_at)),channelId:'doses'},
    });
  }
  return upcoming.length;
}
