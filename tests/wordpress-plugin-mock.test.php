<?php
error_reporting(E_ALL);
if (!defined('ABSPATH')) define('ABSPATH', sys_get_temp_dir() . '/tsa-sync-mock-wp-' . getmypid() . '/');
foreach (array('file.php','media.php','image.php') as $f) {
    @mkdir(ABSPATH.'wp-admin/includes',0777,true);
    if (!is_file(ABSPATH.'wp-admin/includes/'.$f)) file_put_contents(ABSPATH.'wp-admin/includes/'.$f, '<?php');
}
class WP_Error {private $code; public function __construct($code,$msg,$data=array()) {$this->code=$code;} public function get_error_code() {return $this->code;}}
$GLOBALS['posts']=array(); $GLOBALS['meta']=array(); $GLOBALS['options']=array(); $GLOBALS['hits']=array();
$GLOBALS['fake_failure']=''; $GLOBALS['next_post_id']=200; $GLOBALS['next_attachment_id']=500;
function err($code,$actual) {if (!($actual instanceof WP_Error) || $actual->get_error_code() !== $code) throw new Exception('expected '.$code.', got '.var_export($actual,true));}
function add_action(){}
function add_management_page(){}
function get_option($key,$fallback=''){return array_key_exists($key,$GLOBALS['options'])?$GLOBALS['options'][$key]:$fallback;}
function add_option($key,$value){if(array_key_exists($key,$GLOBALS['options'])) return false; $GLOBALS['options'][$key]=$value;return true;}
function update_option($key,$value){$GLOBALS['options'][$key]=$value;return true;}
function delete_option($key){unset($GLOBALS['options'][$key]);}
function get_post($id) {return isset($GLOBALS['posts'][$id])?clone $GLOBALS['posts'][$id]:null;}
function get_post_meta($id,$key,$single=true) {return $GLOBALS['meta'][$id][$key]??'';}
function update_post_meta($id,$key,$value) {$GLOBALS['meta'][$id][$key]=$value; return true;}
function delete_post_meta($id,$key){unset($GLOBALS['meta'][$id][$key]);return true;}
function get_post_thumbnail_id($id){return (int)get_post_meta($id,'_thumbnail_id');}
function set_post_thumbnail($id,$att){update_post_meta($id,'_thumbnail_id',(int)$att);return true;}
function delete_post_thumbnail($id){delete_post_meta($id,'_thumbnail_id');return true;}
function get_posts($args){$found=array();foreach($GLOBALS['posts'] as $id=>$p){if($p->post_type!=='tribe_events')continue;if(isset($args['post_status'])&&!in_array($p->post_status,$args['post_status'],true))continue;if(isset($args['meta_key'])&&get_post_meta($id,$args['meta_key'])!=$args['meta_value'])continue;if(isset($args['s'])&&stripos($p->post_title,$args['s'])===false)continue;if(isset($args['meta_query'])){ $q=$args['meta_query'][0]; $v=get_post_meta($id,$q['key']);if($v<$q['value'][0]||$v>$q['value'][1])continue;} $found[]=$id;}return array_slice($found,0,$args['numberposts']??100);}
function wp_update_post($args,$returns_error=false){$id=$args['ID']; if(!isset($GLOBALS['posts'][$id]))return new WP_Error('missing','Missing'); if($GLOBALS['fake_failure']==='publish'&&($args['post_status']??'')==='publish')return new WP_Error('publish_fail','Simulated');foreach($args as $k=>$v){if($k==='ID')continue;$attr=$k==='post_status'?'post_status':$k; $GLOBALS['posts'][$id]->$attr=$v;}return $id;}
function wp_delete_post($id){unset($GLOBALS['posts'][$id]);}
function wp_delete_attachment($id){unset($GLOBALS['posts'][$id]);}
function wp_kses_post($s){return $s;}
function sanitize_text_field($s){return trim($s);}
function wp_strip_all_tags($s){return strip_tags($s);}
function rest_ensure_response($arr){return $arr;}
function get_permalink($id){return 'https://example.test/?p='.$id;}
function is_wp_error($v){return $v instanceof WP_Error;}
function post_type_exists($s){return true;}
function wp_safe_remote_get($url,$args){return array('status'=>200,'body'=>base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y+/kagAAAAASUVORK5CYII='));}
function wp_remote_retrieve_response_code($r){return $r['status'];}
function wp_remote_retrieve_body($r){return $r['body'];}
function wp_tempnam($filename){return tempnam(sys_get_temp_dir(),'tsa_');}
function media_handle_sideload($file,$id){@unlink($file['tmp_name']);$att=++$GLOBALS['next_attachment_id'];$GLOBALS['posts'][$att]=(object)array('ID'=>$att,'post_type'=>'attachment','post_status'=>'inherit');return $att;}
function tsa_reset(){ $GLOBALS['posts']=array();$GLOBALS['meta']=array();$GLOBALS['options']=array();$GLOBALS['hits']=array();$GLOBALS['fake_failure']='';$GLOBALS['next_post_id']=200;$GLOBALS['next_attachment_id']=500; }
function make_post($id,$payload,$status='publish',$snapshot=true){
    $date=$payload['event_date']; $start=$payload['start_time'];$ts=new DateTimeImmutable($date.' '.$start.':00',new DateTimeZone('Asia/Tokyo'));$end=$ts->modify('+1 hour');
    $GLOBALS['posts'][$id]=(object)array('ID'=>$id,'post_type'=>'tribe_events','post_status'=>$status,'post_title'=>$payload['title'],'post_content'=>$payload['public_description']);
    fake_dates($id,$ts->format('Y-m-d H:i:s'),$end->format('Y-m-d H:i:s'));
    update_post_meta($id,'_tsa_sync_external_id',$payload['external_id']);update_post_meta($id,'_tsa_sync_verified_start',$ts->format('Y-m-d H:i:s'));
    update_post_meta($id,'wpos_event',array('place'=>$payload['venue'],'open'=>tsa_sync_format_open_start($payload['open_time'],$start),'start'=>$start,'price'=>'adv. ￥'.number_format($payload['advance_price']).' door ￥'.number_format($payload['door_price']),'custom_note'=>'preserve'));
    if(!empty($payload['flyer_path'])){$att=501;$GLOBALS['posts'][$att]=(object)array('ID'=>$att,'post_type'=>'attachment','post_status'=>'inherit');update_post_meta($att,'_tsa_sync_flyer_path',$payload['flyer_path']);set_post_thumbnail($id,$att);}
    if($snapshot)update_post_meta($id,'_tsa_sync_state_v1',tsa_sync_current_public_state($id));
}
function fake_dates($id,$start,$end){$tz=new DateTimeZone('Asia/Tokyo');$utc=new DateTimeZone('UTC');foreach(array('Start'=>$start,'End'=>$end)as $k=>$t){update_post_meta($id,'_Event'.$k.'Date',$t);update_post_meta($id,'_Event'.$k.'DateUTC',(new DateTimeImmutable($t,$tz))->setTimezone($utc)->format('Y-m-d H:i:s'));}update_post_meta($id,'_EventTimezone','Asia/Tokyo');update_post_meta($id,'_EventAllDay','');}
class FakeRepo {private $id;private $args;
 function where($field,$id){if($field==='id'){$this->id=$id;return $this;}if($field==='post_status'&&$id==='draft')return $this;throw new Exception('Unexpected repo filter');}
 function set_args($a){$this->args=$a;return $this;}
 function save(){if($GLOBALS['fake_failure']==='repo_throws')throw new RuntimeException('tec failure');if($GLOBALS['fake_failure']==='repo_no_change')return null;if($this->id) {$id=$this->id;$p=&$GLOBALS['posts'][$id];$p->post_title=$this->args['title'];$p->post_content=$this->args['description'];fake_dates($id,$this->args['start_date'],$this->args['end_date']);if($GLOBALS['fake_failure']==='repo_bad_date')update_post_meta($id,'_EventStartDate','1970-01-01 00:00:00');return null;}throw new Exception('No event ID');}
 function create(){$id=++$GLOBALS['next_post_id'];$GLOBALS['posts'][$id]=(object)array('ID'=>$id,'post_type'=>'tribe_events','post_status'=>'draft','post_title'=>$this->args['title'],'post_content'=>$this->args['description']);fake_dates($id,$this->args['start_date'],$this->args['end_date']);return get_post($id);}
}
function tribe_events(){return new FakeRepo();}
function request($id='abcd1234abcd1234abcd1234abcd1234'){return new class($id){private $id;function __construct($id){$this->id=$id;}function get_header($name){return $name==='x-tsa-nonce'?$this->id:'';}};}
function run($data,$nonce) {return tsa_sync_write_event($data,request(sprintf('%032x',$nonce)));}
function check($cond,$msg){if(!$cond)throw new Exception('FAILED: '.$msg);}
require __DIR__ . '/../wordpress/tsa-event-sync-receiver/tsa-event-sync-receiver.php';
$base=array('external_id'=>'11111111-1111-1111-1111-111111111111','action'=>'upsert','title'=>'テスト公演','event_date'=>'2027-03-01','open_time'=>'17:30','start_time'=>'18:00','venue'=>'Thunder Snake ATSUGI','advance_price'=>3000,'door_price'=>3500,'public_description'=>'テスト用','flyer_path'=>null);
$tests=array();
function test($title,$callback){global $tests;$callback();$tests[]=$title;}
test('mapped published update changes content, time and price IN PLACE',function()use($base){tsa_reset();make_post(101,$base);$changed=array_merge($base,array('title'=>'更新後の公演','event_date'=>'2027-03-02','start_time'=>'19:00','advance_price'=>4000));$r=run($changed,1);check(($r['operation']??'')==='updated','operation');check($r['post_id']===101,'post id');check(count(array_filter($GLOBALS['posts'],fn($x)=>$x->post_type==='tribe_events'))===1,'one event');check(get_post(101)->post_status==='publish','published');check(get_post_meta(101,'_EventStartDate')==='2027-03-02 19:00:00','date');check(get_post_meta(101,'wpos_event')['custom_note']==='preserve','theme extras');});
test('unchanged update does not touch post',function()use($base){tsa_reset();make_post(101,$base);$r=run($base,2);check(($r['operation']??'')==='unchanged','unchanged operation');check(get_post(101)->post_status==='publish','kept live');});
test('manual WordPress changes block app update',function()use($base){tsa_reset();make_post(101,$base);$GLOBALS['posts'][101]->post_title='手動編集';$r=run(array_merge($base,array('title'=>'アプリ編集')),3);err('tsa_sync_manual_edit_conflict',$r);check(get_post(101)->post_title==='手動編集','not overwritten');});
test('unsynced WordPress post is never adopted',function()use($base){tsa_reset();make_post(101,$base);delete_post_meta(101,'_tsa_sync_external_id');$r=run($base,4);check($r instanceof WP_Error || (($r['post_id']??null)!==101),'no adoption');});
test('target date containing manual event blocks update',function()use($base){tsa_reset();make_post(101,$base);$manual=array_merge($base,array('event_date'=>'2027-03-02'));make_post(102,$manual,'publish',false);delete_post_meta(102,'_tsa_sync_external_id');$r=run(array_merge($base,array('event_date'=>'2027-03-02')),5);err('tsa_sync_manual_day_collision',$r);check(get_post(101)->post_status==='publish','old kept public');});
test('TEC save failure retains draft to avoid partial public update',function()use($base){tsa_reset();make_post(101,$base);$GLOBALS['fake_failure']='repo_no_change';$r=run(array_merge($base,array('title'=>'変更後')),6);err('tsa_sync_update_date_integrity',$r);check(get_post(101)->post_status==='draft','left draft');});
test('TEC wrong date retains draft',function()use($base){tsa_reset();make_post(101,$base);$GLOBALS['fake_failure']='repo_bad_date';$r=run(array_merge($base,array('start_time'=>'19:00')),7);err('tsa_sync_update_date_integrity',$r);check(get_post(101)->post_status==='draft','left draft');});
test('legacy mapped unchanged event establishes baseline WITHOUT changing content',function()use($base){tsa_reset();make_post(101,$base,'publish',false);$r=run($base,8);check(($r['operation']??'')==='baseline_only','baseline result');check(is_array(get_post_meta(101,'_tsa_sync_state_v1')),'recorded');check(get_post(101)->post_status==='publish','still publish');});
test('legacy mapping differing from incoming payload is blocked',function()use($base){tsa_reset();make_post(101,$base,'publish',false);$r=run(array_merge($base,array('title'=>'changed from app')),9);err('tsa_sync_baseline_required',$r);check(get_post(101)->post_status==='publish','unchanged');});
test('manual draft cannot be auto-published',function()use($base){tsa_reset();make_post(101,$base,'draft',true);$r=run($base,10);err('tsa_sync_manual_draft_review',$r);check(get_post(101)->post_status==='draft','still draft');});
test('unpublish then republish works with snapshot',function()use($base){tsa_reset();make_post(101,$base);$r=run(array('external_id'=>$base['external_id'],'action'=>'unpublish'),11);check(($r['action']??'')==='unpublish','unpublish accepted');check(get_post(101)->post_status==='draft','draft now');check(get_post_meta(101,'_tsa_sync_unpublished_by_sync')==='1','marker');$r=run(array_merge($base,array('title'=>'復活')),12);check(($r['operation']??'')==='updated','republish accepted');check(get_post(101)->post_status==='publish','now published');check(get_post_meta(101,'_tsa_sync_unpublished_by_sync')==='', 'marker gone');});
test('flyer replaced if source path changes',function()use($base){tsa_reset();make_post(101,$base);$flyer='26764cb8-aa2c-4a6e-af39-50d04fe8debf/8ec6841d-751c-4ce9-9d57-a861f51901d2-1795331082061.png';$r=run(array_merge($base,array('flyer_path'=>$flyer)),13);check(($r['operation']??'')==='updated','flyer change accepted: '.var_export($r,true));check(get_post_thumbnail_id(101)>0,'thumbnail');check(get_post_meta(get_post_thumbnail_id(101),'_tsa_sync_flyer_path')===$flyer,'matching path');});
test('flyer removal clears thumbnail',function()use($base){tsa_reset();$flyer='26764cb8-aa2c-4a6e-af39-50d04fe8debf/8ec6841d-751c-4ce9-9d57-a861f51901d2-1795331082061.png';$with=array_merge($base,array('flyer_path'=>$flyer));make_post(101,$with);$r=run($base,14);check(($r['operation']??'')==='updated','flyer removed');check(get_post_thumbnail_id(101)===0,'no thumbnail');});
test('replay nonce rejected and lock released',function()use($base){tsa_reset();make_post(101,$base);$r=run($base,15);check(($r['operation']??'')==='unchanged','initial');$r=run($base,15);err('tsa_sync_replay',$r);check(!get_option('tsa_sync_lock_'.hash('sha256',$base['external_id']),false),'lock cleaned');});
test('new import gets baseline and remains mapped',function()use($base){tsa_reset();$r=run($base,16);check(($r['mapping_status']??'')==='none','created response');$id=$r['post_id'];check($id>200,'new id');check(get_post($id)->post_status==='publish','publish');check(get_post_meta($id,'_tsa_sync_external_id')===$base['external_id'],'mapped');check(is_array(get_post_meta($id,'_tsa_sync_state_v1')),'saved baseline');});
test('manual edits prohibit automatic unpublish of tracked post',function()use($base){tsa_reset();make_post(101,$base);$GLOBALS['posts'][101]->post_content='WordPressで手動修正';$r=run(array('external_id'=>$base['external_id'],'action'=>'unpublish'),17);err('tsa_sync_manual_edit_conflict',$r);check(get_post(101)->post_status==='publish','still published');});
test('manual edits to featured image prohibit automatic update',function()use($base){tsa_reset();make_post(101,$base);set_post_thumbnail(101,999);$r=run(array_merge($base,array('title'=>'アプリ更新')),18);err('tsa_sync_manual_edit_conflict',$r);check(get_post(101)->post_status==='publish','still published');});
test('canary requires same single-event create update and unpublish',function()use($base){
    tsa_reset();
    update_option('tsa_sync_write_mode','single');
    update_option('tsa_sync_single_external_id',$base['external_id']);
    check(!tsa_sync_canary_complete(),'initially locked');
    $r=run($base,101);check(($r['action']??null)==='upsert','created');
    check(!tsa_sync_canary_complete(),'still locked after create');
    $r=run(array_merge($base,array('title'=>'テスト更新確認')),102);
    check(($r['operation']??'')==='updated','updated');
    check(!tsa_sync_canary_complete(),'still locked after update');
    $r=run(array('external_id'=>$base['external_id'],'action'=>'unpublish'),103);
    check(($r['action']??null)==='unpublish','unpublished');
    check(tsa_sync_canary_complete(),'canary unlocked only after three passes');
    tsa_sync_reset_canary();check(!tsa_sync_canary_complete(),'new test ID resets canary');
});
test('canary cannot be completed by unapproved event',function()use($base){
    tsa_reset();
    update_option('tsa_sync_write_mode','single');
    update_option('tsa_sync_single_external_id','another-id');
    run($base,104);
    tsa_sync_canary_stage($base['external_id'],'created');
    tsa_sync_canary_stage($base['external_id'],'updated');
    tsa_sync_canary_stage($base['external_id'],'unpublished');
    check(!tsa_sync_canary_complete(),'other event cannot unlock');
});
test('full mode only starts with complete single-ID canary',function()use($base){
    tsa_reset();
    update_option('tsa_sync_write_mode','all');
    $request = new class($base) { private $payload; function __construct($p){$this->payload=$p;} function get_body(){return json_encode($this->payload,JSON_UNESCAPED_UNICODE);} function get_header($k){return $k==='x-tsa-nonce'?'fedcba9876543210fedcba9876543210':'';} };
    $r=tsa_sync_receive_event($request);
    check(($r['dry_run']??null)===true,'all mode requires canary');
});
test('new create response identifies created and does not touch PICKUP taxonomy',function()use($base){
    tsa_reset();
    $r=run(array_merge($base,array('pickup'=>true)),201);
    check(($r['operation']??'')==='created','explicit created operation');
    check(!function_exists('tsa_sync_apply_pickup'),'pickup category updater removed');
    check(get_post($r['post_id'])->post_status==='publish','new event published');
});
test('unpublish response identifies successful transition, and subsequent call no-change',function()use($base){
    tsa_reset();make_post(101,$base);
    $r=run(array('external_id'=>$base['external_id'],'action'=>'unpublish'),202);
    check(($r['operation']??'')==='unpublished','first unpublish transition');
    $r=run(array('external_id'=>$base['external_id'],'action'=>'unpublish'),203);
    check(($r['operation']??'')==='no_change','idempotent unpublish');
    check(get_post(101)->post_status==='draft','still draft');
});
test('non-test events cannot change canary stage',function()use($base){
    tsa_reset();update_option('tsa_sync_write_mode','single');
    update_option('tsa_sync_single_external_id',$base['external_id']);
    foreach(array('created','updated','unpublished') as $stage)tsa_sync_canary_stage('different-external-id',$stage);
    check(!tsa_sync_canary_complete(),'unmatched ID does not unlock global mode');
});
echo 'PASS '.count($tests).' tests'.PHP_EOL;foreach($tests as $t)echo ' ✓ '.$t.PHP_EOL;