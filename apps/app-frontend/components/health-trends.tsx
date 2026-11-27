import { useState } from 'react';
import { Text, View } from 'react-native';
import { healthSeries, measurementOptions, type RecordRow } from '@pharmalert/shared';
import { Button, styles } from './ui';

export function HealthTrends({rows}:{rows:RecordRow[]}) {
  const [selected,setSelected]=useState(0);
  const [key,title]=measurementOptions[selected];
  const points=healthSeries(rows,key).slice(-7);
  const max=Math.max(1,...points.flatMap(point=>[point.value,point.diastolic??0]));
  return <View style={styles.card}>
    <Text style={styles.h2}>Measurement trends</Text>
    <Button title={title} secondary onPress={()=>setSelected((selected+1)%measurementOptions.length)}/>
    {points.length?<View style={{flexDirection:'row',alignItems:'flex-end',gap:4}}>
      {points.map(point=><View key={point.id} accessible accessibilityLabel={point.date+', '+point.value+(point.diastolic===undefined?'':' over '+point.diastolic)} style={{flex:1,alignItems:'center'}}>
        <Text numberOfLines={1} style={[styles.muted,{fontSize:10}]}>{point.value}{point.diastolic===undefined?'':'/'+point.diastolic}</Text>
        <View style={{flexDirection:'row',alignItems:'flex-end',gap:2,height:76}}>
          <View style={{width:10,height:Math.max(2,point.value/max*74),backgroundColor:'#08785e',borderRadius:3}}/>
          {point.diastolic!==undefined&&<View style={{width:10,height:Math.max(2,point.diastolic/max*74),backgroundColor:'#2861a0',borderRadius:3}}/>}
        </View>
        <Text numberOfLines={1} style={[styles.muted,{fontSize:9}]}>{point.date}</Text>
      </View>)}
    </View>:<Text style={styles.muted}>Enter a numeric measurement with its unit to see a trend.</Text>}
  </View>;
}
