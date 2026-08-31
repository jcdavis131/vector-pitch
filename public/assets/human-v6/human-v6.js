// Human v6 — Pitch — Selection/Peers/Evidence/Share — stdlib only
window.DumbModel=window.DumbModel||{}; window.DumbModel.HumanV6={
 Selection:{init(){},update(id){history.pushState(null,'','?id='+encodeURIComponent(id))},clear(){history.pushState(null,'','/')},destroy(){}},
 Search:{init(){},query(q){return []},destroy(){}},
 Peers:{init(){},update(){},destroy(){}},
 Evidence:{init(){},open(){},close(){},destroy(){}},
 Share:{init(){},copy(){navigator.clipboard&&navigator.clipboard.writeText(location.href)},destroy(){}}
};
