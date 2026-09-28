import {useRef} from 'react';
import type {LayoutChangeEvent,NativeScrollEvent,NativeSyntheticEvent} from 'react-native';

export function useInfiniteScroll(loadMore:()=>void){
 const dimensions=useRef({height:0,content:0,offset:0});
 function check(){const {height,content,offset}=dimensions.current;if(height>0&&content>0&&offset+height>=content-120)loadMore();}
 return {
  scrollEventThrottle:100,
  onLayout:(event:LayoutChangeEvent)=>{dimensions.current.height=event.nativeEvent.layout.height;check();},
  onContentSizeChange:(_width:number,height:number)=>{dimensions.current.content=height;check();},
  onScroll:(event:NativeSyntheticEvent<NativeScrollEvent>)=>{dimensions.current.offset=event.nativeEvent.contentOffset.y;check();},
 };
}
