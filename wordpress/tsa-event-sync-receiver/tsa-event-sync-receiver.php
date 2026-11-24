<?php
/**
 * Plugin Name: TSA Event Sync Receiver
 * Description: Authenticated livehouse event sync with a safe dry-run default and single-event test mode.
 * Version: 0.2.9
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) { exit; }

/**
 * Signing secret is read from wp-config.php (if explicitly set) or a
 * non-autoloaded WordPress option configured by site administrators.
 * Never log, echo publicly, or send it to browsers except once during generation.
 */
function tsa_sync_signing_secret() {
    if (defined('TSA_EVENT_SYNC_SECRET') && is_string(TSA_EVENT_SYNC_SECRET) && strlen(TSA_EVENT_SYNC_SECRET) >= 32) {
        return TSA_EVENT_SYNC_SECRET;
    }
    $stored = get_option('tsa_sync_signing_secret', '');
    return is_string($stored) && strlen($stored) >= 32 ? $stored : '';
}
function tsa_sync_configured() {
    return tsa_sync_signing_secret() !== '';
}

// Emergency safety gate for v0.2.1: stop writes on upgrade, including if
// an older version was left in single-event or global write mode.
// Re-enabling requires a deliberate administrator action after inspection.
add_action('init', function () {
    if (get_option('tsa_sync_safety_version', '') === '0.2.9') { return; }
    update_option('tsa_sync_write_mode', 'dry_run', false);
    update_option('tsa_sync_safety_version', '0.2.9', false);
}, 0);

// Verify TEC's actual saved metadata (not just the input payload) BEFORE
// publishing. This catches 1970-01-01, shifted dates, and erroneous all-day events.
function tsa_sync_event_dates_match($post_id, $expected_start, $expected_end) {
    $start = get_post_meta($post_id, '_EventStartDate', true);
    $end = get_post_meta($post_id, '_EventEndDate', true);
    if (!is_string($start) || !is_string($end) ||
        $start !== $expected_start || $end !== $expected_end) {
        return false;
    }
    // Exact timestamps are insufficient: TEC can still mark an event as
    // all-day, causing it to be displayed incorrectly in the admin and UI.
    // Empty/missing _EventAllDay is non-all-day in TEC's filtering semantics.
    $all_day = get_post_meta($post_id, '_EventAllDay', true);
    $all_day_truthy = function_exists('tribe_is_truthy')
        ? tribe_is_truthy($all_day)
        : in_array(strtolower((string) $all_day), array('1','yes','true','on','enabled','enable','y'), true);
    if ($all_day_truthy) { return false; }
    $timezone = get_post_meta($post_id, '_EventTimezone', true);
    if (!is_string($timezone) || $timezone !== 'Asia/Tokyo') { return false; }
    $tz = new DateTimeZone('Asia/Tokyo');
    $utc = new DateTimeZone('UTC');
    $expected_start_utc = (new DateTimeImmutable($expected_start, $tz))->setTimezone($utc)->format('Y-m-d H:i:s');
    $expected_end_utc = (new DateTimeImmutable($expected_end, $tz))->setTimezone($utc)->format('Y-m-d H:i:s');
    $actual_start_utc = get_post_meta($post_id, '_EventStartDateUTC', true);
    $actual_end_utc = get_post_meta($post_id, '_EventEndDateUTC', true);
    // Require TEC's UTC companion metadata as well as local date metadata.
    return is_string($actual_start_utc) && $actual_start_utc === $expected_start_utc &&
        is_string($actual_end_utc) && $actual_end_utc === $expected_end_utc;
}

add_action('rest_api_init', function () {
    if (!tsa_sync_configured()) { return; }
    register_rest_route('tsa-sync/v1', '/events', array(
        'methods' => 'POST',
        'callback' => 'tsa_sync_receive_event',
        'permission_callback' => 'tsa_sync_authenticate',
    ));
});

function tsa_sync_authenticate($request) {
    if (!tsa_sync_configured()) {
        return new WP_Error('tsa_sync_disabled', 'Sync not configured', array('status' => 404));
    }
    $timestamp = $request->get_header('x-tsa-timestamp');
    $signature = $request->get_header('x-tsa-signature');
    $nonce = $request->get_header('x-tsa-nonce');
    if (!is_string($timestamp) || !preg_match('/^[0-9]{10}$/', $timestamp) ||
        abs(time() - (int) $timestamp) > 300 ||
        !is_string($nonce) || !preg_match('/^[a-f0-9]{32}$/', $nonce) ||
        !is_string($signature) || !preg_match('/^sha256=[a-f0-9]{64}$/', $signature)) {
        return new WP_Error('tsa_sync_unauthorized', 'Unauthorized', array('status' => 401));
    }
    $expected = 'sha256=' . hash_hmac('sha256', $timestamp . '.' . $nonce . '.' . $request->get_body(), tsa_sync_signing_secret());
    if (!hash_equals($expected, $signature)) {
        return new WP_Error('tsa_sync_unauthorized', 'Unauthorized', array('status' => 401));
    }
    return true;
}

/**
 * Conservative rollout rule: a newly imported event must not share a date with
 * any manually maintained event. It prevents duplicates when the app's title
 * is an abbreviation of the event already listed on the public schedule.
 * Mapped events remain freely updateable.
 */
function tsa_sync_day_has_manual_event($date) {
    $same_day = get_posts(array(
        'post_type'=>'tribe_events',
        'post_status'=>array('publish','future','draft','pending','private','trash'),
        'numberposts'=>200,
        'fields'=>'ids',
        'meta_query'=>array(array(
            'key'=>'_EventStartDate',
            'value'=>array($date . ' 00:00:00', $date . ' 23:59:59'),
            'compare'=>'BETWEEN',
            'type'=>'CHAR',
        )),
        'suppress_filters'=>true,
    ));
    if (count($same_day) >= 200) return true;
    foreach ($same_day as $candidate) {
        $mapped = get_post_meta($candidate, '_tsa_sync_external_id', true);
        if (!is_string($mapped) || $mapped === '') return true;
    }
    return false;
}

/**
 * A production-wide write mode can only be enabled AFTER a complete one-event
 * create -> update -> unpublish canary. All 3 stages are persisted for the
 * same explicit external ID and only from verified successful sync operations.
 */
function tsa_sync_canary_stage($external_id, $stage) {
    if (!in_array($stage, array('created', 'updated', 'unpublished'), true)) return;
    if (get_option('tsa_sync_write_mode', 'dry_run') !== 'single') return;
    $single = get_option('tsa_sync_single_external_id', '');
    if (!is_string($single) || !is_string($external_id) || $single === '' ||
        !hash_equals($single, $external_id)) return;
    update_option('tsa_sync_canary_' . $stage . '_id', $external_id, false);
}
function tsa_sync_canary_complete() {
    $id = get_option('tsa_sync_single_external_id', '');
    if (!is_string($id) || $id === '') return false;
    foreach (array('created', 'updated', 'unpublished') as $stage) {
        $recorded = get_option('tsa_sync_canary_' . $stage . '_id', '');
        if (!is_string($recorded) || !hash_equals($id, $recorded)) return false;
    }
    return true;
}
function tsa_sync_reset_canary() {
    foreach (array('created','updated','unpublished') as $stage) {
        delete_option('tsa_sync_canary_' . $stage . '_id');
    }
}

function tsa_sync_receive_event($request) {
    $data = json_decode($request->get_body(), true);
    if (!is_array($data) || !isset($data['external_id'], $data['action']) ||
        !is_string($data['external_id']) ||
        !preg_match('/^[a-zA-Z0-9_-]{1,100}$/', $data['external_id']) ||
        !is_string($data['action']) || !in_array($data['action'], array('upsert', 'unpublish'), true)) {
        return new WP_Error('tsa_sync_invalid', 'Invalid event request', array('status' => 400));
    }
    if (!post_type_exists('tribe_events')) {
        return new WP_Error('tsa_sync_missing_events', 'The Events Calendar post type was not found', array('status' => 409));
    }
    if ($data['action'] === 'upsert') {
        if (empty($data['title']) || !is_string($data['title']) || strlen($data['title']) > 1200 ||
            empty($data['event_date']) || !is_string($data['event_date']) ||
            !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['event_date']) ||
            !checkdate((int) substr($data['event_date'], 5, 2), (int) substr($data['event_date'], 8, 2), (int) substr($data['event_date'], 0, 4))) {
            return new WP_Error('tsa_sync_invalid', 'Invalid public event fields', array('status' => 400));
        }
    }
    $existing = get_posts(array(
        'post_type' => 'tribe_events',
        'post_status' => array('publish', 'future', 'draft', 'pending', 'private', 'trash'),
        'numberposts' => 2,
        'fields' => 'ids',
        'meta_key' => '_tsa_sync_external_id',
        'meta_value' => $data['external_id'],
        'suppress_filters' => true,
    ));
    if (count($existing) > 1) {
        return new WP_Error('tsa_sync_duplicate_mapping', 'Duplicate event mappings need manual review', array('status' => 409));
    }
    $match = count($existing) === 1 ? 'mapped' : 'none';
    if ($match === 'none' && $data['action'] === 'upsert') {
        $legacy = get_posts(array(
            'post_type' => 'tribe_events',
            'post_status' => array('publish', 'future', 'draft', 'pending', 'private', 'trash'),
            'numberposts' => 100,
            'fields' => 'ids',
            's' => $data['title'],
            'suppress_filters' => true,
        ));
        // A saturated search is ambiguous; never create a duplicate on this basis.
        if (count($legacy) >= 100) {
            return new WP_Error('tsa_sync_legacy_search_limit', 'Legacy event search needs manual review', array('status' => 409));
        }
        foreach ($legacy as $legacy_id) {
            $post = get_post($legacy_id);
            if (!$post || trim(wp_strip_all_tags($post->post_title)) !== trim($data['title'])) { continue; }
            $start = get_post_meta($legacy_id, '_EventStartDate', true);
            if (!is_string($start) || $start === '' || substr($start, 0, 10) === $data['event_date']) {
                return new WP_Error('tsa_sync_legacy_collision', 'Existing event requires manual mapping', array('status' => 409));
            }
        }
    }
    if ($match === 'none' && $data['action'] === 'upsert' && tsa_sync_day_has_manual_event($data['event_date'])) {
        return new WP_Error('tsa_sync_manual_day_collision', 'Existing manual event on the same date requires review', array('status'=>409));
    }
    // Opt-in gate: even a valid signed request is always dry-run by default.
    $mode = get_option('tsa_sync_write_mode', 'dry_run');
    $single_id = get_option('tsa_sync_single_external_id', '');
    if ($mode === 'single' && is_string($single_id) && hash_equals($single_id, $data['external_id'])) {
        return tsa_sync_write_event($data, $request);
    }
    // Full-site mode is gated by explicit administrator confirmation *after*
    // a verified three-stage single-event canary. It is never enabled by upgrade.
    if ($mode === 'all' && tsa_sync_canary_complete()) {
        return tsa_sync_write_event($data, $request);
    }
    return rest_ensure_response(array(
        'accepted' => true,
        'dry_run' => true,
        'mapping_status' => $match,
        'action' => $data['action'],
        'external_id' => $data['external_id'],
    ));
}


/**
 * The Events Calendar writes. This path is activated only by an administrator
 * in the WordPress Tools screen. No manual event is ever automatically claimed.
 * A distinct atomic option lock per external ID prevents concurrent creates.
 */
/**
 * Thunder Snake's public theme reads the single custom `開場/開演` field
 * (wpos_event['open']) verbatim. It does not combine separate open/start keys.
 * Match the site's manually maintained convention: "open HH:MM start HH:MM".
 * START is required; OPEN may legitimately be unspecified.
 */
function tsa_sync_format_open_start($open, $start) {
    return ($open !== null ? 'open ' . $open . ' ' : '') . 'start ' . $start;
}

/**
 * Only known Supabase public Storage object paths from this app are permitted.
 * No URLs, redirects, private networks, or user-supplied hosts are accepted.
 * App uploader uses: <team UUID>/<file UUID>-<timestamp>.<jpg|jpeg|png|webp>.
 */
function tsa_sync_flyer_url($path) {
    if (!is_string($path) || strlen($path) > 250 ||
        !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[0-9]{10,16}\.(jpe?g|png|webp)$/i', $path)) {
        return new WP_Error('tsa_sync_flyer_path', 'Invalid public flyer path', array('status'=>422));
    }
    return 'https://dfvuynqpfpgeekgoksyu.supabase.co/storage/v1/object/public/event-flyers/' . $path;
}

/**
 * The file is copied into WordPress Media, so schedule-monthly can display
 * a local featured image. Only newly created, still-draft sync posts use this.
 * Any media error prevents publication (not a silent missing flyer).
 */
function tsa_sync_attach_flyer($post_id, $path) {
    if ($path === null || $path === '') return 0;
    $url = tsa_sync_flyer_url($path);
    if (is_wp_error($url)) return $url;
    $response = wp_safe_remote_get($url, array(
        'timeout'=>18, 'redirection'=>0, 'sslverify'=>true,
        'limit_response_size'=>5242881,
        'headers'=>array('Accept'=>'image/jpeg,image/png,image/webp'),
    ));
    if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) {
        return new WP_Error('tsa_sync_flyer_download', 'Could not download verified flyer', array('status'=>502));
    }
    $bytes = wp_remote_retrieve_body($response);
    if (!is_string($bytes) || strlen($bytes) < 20 || strlen($bytes) > 5242880) {
        return new WP_Error('tsa_sync_flyer_size', 'Invalid flyer size', array('status'=>422));
    }
    $info = @getimagesizefromstring($bytes);
    if (!is_array($info) || !isset($info['mime'], $info[0], $info[1])) {
        return new WP_Error('tsa_sync_flyer_not_image', 'Flyer is not a supported image', array('status'=>422));
    }
    $allowed = array('image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp');
    $mime = $info['mime'];
    if (!isset($allowed[$mime]) || $info[0] < 1 || $info[1] < 1 ||
        $info[0] > 8000 || $info[1] > 8000 || $info[0] * $info[1] > 40000000) {
        return new WP_Error('tsa_sync_flyer_dimensions', 'Invalid flyer format or dimensions', array('status'=>422));
    }
    // Match the actual decoded MIME to the file extension; never rename HTML
    // or an unexpected format to a trusted image extension.
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if (($mime === 'image/jpeg' && !in_array($ext,array('jpg','jpeg'),true)) ||
        ($mime !== 'image/jpeg' && $ext !== $allowed[$mime])) {
        return new WP_Error('tsa_sync_flyer_mime', 'Flyer extension and content mismatch', array('status'=>422));
    }
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $filename = 'tsa-event-' . (int) $post_id . '-' . substr(hash('sha256',$path),0,12) . '.' . $allowed[$mime];
    $tmp = wp_tempnam($filename);
    if (!is_string($tmp) || $tmp === '' || file_put_contents($tmp,$bytes) !== strlen($bytes)) {
        if (is_string($tmp) && is_file($tmp)) @unlink($tmp);
        return new WP_Error('tsa_sync_flyer_temp', 'Could not stage flyer image', array('status'=>502));
    }
    $file = array('name'=>$filename, 'tmp_name'=>$tmp, 'type'=>$mime, 'size'=>strlen($bytes), 'error'=>0);
    $attachment_id = media_handle_sideload($file,$post_id,'TSA event flyer');
    if (is_wp_error($attachment_id)) {
        if (is_file($tmp)) @unlink($tmp);
        return new WP_Error('tsa_sync_flyer_media', 'Could not import flyer into media library', array('status'=>502));
    }
    $attachment_id = (int) $attachment_id;
    if (!$attachment_id || !set_post_thumbnail($post_id,$attachment_id) ||
        (int) get_post_thumbnail_id($post_id) !== $attachment_id) {
        if ($attachment_id) wp_delete_attachment($attachment_id,true);
        return new WP_Error('tsa_sync_flyer_thumbnail', 'Could not set flyer as featured image', array('status'=>502));
    }
    update_post_meta($attachment_id,'_tsa_sync_flyer_path',$path);
    return $attachment_id;
}

/**
 * Snapshot only the fields this integration owns. Anything manually changed in
 * WordPress since the last successful sync blocks further automatic updates.
 * The home page XO Slider and arbitrary theme/taxonomy settings are NOT owned.
 */
function tsa_sync_current_public_state($post_id) {
    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'tribe_events') return null;
    $theme = get_post_meta($post_id, 'wpos_event', true);
    if (!is_array($theme)) $theme = array();
    $thumb = (int) get_post_thumbnail_id($post_id);
    return array(
        'title' => (string) $post->post_title,
        'description' => (string) $post->post_content,
        'status' => (string) $post->post_status,
        'start' => (string) get_post_meta($post_id, '_EventStartDate', true),
        'end' => (string) get_post_meta($post_id, '_EventEndDate', true),
        'start_utc' => (string) get_post_meta($post_id, '_EventStartDateUTC', true),
        'end_utc' => (string) get_post_meta($post_id, '_EventEndDateUTC', true),
        'timezone' => (string) get_post_meta($post_id, '_EventTimezone', true),
        'all_day' => (string) get_post_meta($post_id, '_EventAllDay', true),
        'place' => isset($theme['place']) ? (string) $theme['place'] : '',
        'open' => isset($theme['open']) ? (string) $theme['open'] : '',
        'theme_start' => isset($theme['start']) ? (string) $theme['start'] : '',
        'price' => isset($theme['price']) ? (string) $theme['price'] : '',
        'thumbnail_id' => $thumb,
        'flyer_path' => $thumb ? (string) get_post_meta($thumb, '_tsa_sync_flyer_path', true) : '',
    );
}

function tsa_sync_expected_public_fields($data, $expected_start, $expected_end) {
    $adv = isset($data['advance_price']) ? (int) $data['advance_price'] : null;
    $door = isset($data['door_price']) ? (int) $data['door_price'] : null;
    $tz = new DateTimeZone('Asia/Tokyo');
    $utc = new DateTimeZone('UTC');
    return array(
        'title' => sanitize_text_field($data['title']),
        'description' => wp_kses_post(isset($data['public_description']) ? $data['public_description'] : ''),
        'start' => $expected_start,
        'end' => $expected_end,
        'start_utc' => (new DateTimeImmutable($expected_start, $tz))->setTimezone($utc)->format('Y-m-d H:i:s'),
        'end_utc' => (new DateTimeImmutable($expected_end, $tz))->setTimezone($utc)->format('Y-m-d H:i:s'),
        'timezone' => 'Asia/Tokyo',
        'place' => sanitize_text_field(isset($data['venue']) ? $data['venue'] : ''),
        'open' => tsa_sync_format_open_start(isset($data['open_time']) ? $data['open_time'] : null, $data['start_time']),
        'theme_start' => $data['start_time'],
        'price' => ($adv !== null ? 'adv. ￥' . number_format($adv) : '') .
            ($door !== null ? ' door ￥' . number_format($door) : ''),
        'flyer_path' => isset($data['flyer_path']) && $data['flyer_path'] !== null ? $data['flyer_path'] : '',
    );
}

function tsa_sync_state_matches_fields($state, $expected) {
    if (!is_array($state) || !is_array($expected)) return false;
    foreach ($expected as $key => $value) {
        if (!array_key_exists($key, $state) || $state[$key] !== $value) return false;
    }
    $all_day = strtolower($state['all_day']);
    if (function_exists('tribe_is_truthy') ? tribe_is_truthy($all_day) :
        in_array($all_day, array('1','yes','true','on','enabled','enable','y'), true)) return false;
    if ($expected['flyer_path'] !== '' && (int) $state['thumbnail_id'] <= 0) return false;
    if ($expected['flyer_path'] === '' && (int) $state['thumbnail_id'] !== 0) return false;
    return true;
}

function tsa_sync_snapshot_is_unchanged($post_id, $state) {
    $saved = get_post_meta($post_id, '_tsa_sync_state_v1', true);
    return is_array($saved) && $saved === $state;
}

/**
 * No automatic adoption of manual posts. An older v0.2.6 mapped event may
 * only get an initial snapshot if it is PUBLISHED and exactly matches the
 * unchanged source payload. Any changed content or manual draft fails closed.
 */
function tsa_sync_update_mapped_event($post_id, $id, $data, $tec, $expected_start, $expected_end) {
    $current = tsa_sync_current_public_state($post_id);
    if (!$current || get_post_meta($post_id, '_tsa_sync_external_id', true) !== $id) {
        return new WP_Error('tsa_sync_mapping_invalid', 'Mapping changed during update', array('status'=>409));
    }
    if (!in_array($current['status'], array('draft','publish'), true)) {
        return new WP_Error('tsa_sync_status_review', 'Non-public editorial status requires review', array('status'=>409));
    }
    $expected = tsa_sync_expected_public_fields($data, $expected_start, $expected_end);
    $saved = get_post_meta($post_id, '_tsa_sync_state_v1', true);
    if (!is_array($saved)) {
        if ($current['status'] !== 'publish' || !tsa_sync_state_matches_fields($current, $expected) ||
            !tsa_sync_event_dates_match($post_id, $expected_start, $expected_end)) {
            return new WP_Error('tsa_sync_baseline_required', 'First update requires a published event unchanged since import', array('status'=>409));
        }
        update_post_meta($post_id, '_tsa_sync_state_v1', $current);
        if (!tsa_sync_snapshot_is_unchanged($post_id, $current)) {
            return new WP_Error('tsa_sync_baseline_failed', 'Could not record initial sync snapshot', array('status'=>502));
        }
        return rest_ensure_response(array('accepted'=>true,'dry_run'=>false,'action'=>'upsert',
            'operation'=>'baseline_only','mapping_status'=>'mapped','external_id'=>$id,'post_id'=>$post_id));
    }
    if (!tsa_sync_snapshot_is_unchanged($post_id, $current)) {
        return new WP_Error('tsa_sync_manual_edit_conflict', 'WordPress data changed since last sync; manual review required', array('status'=>409));
    }
    if ($current['status'] === 'draft' && get_post_meta($post_id, '_tsa_sync_unpublished_by_sync', true) !== '1') {
        return new WP_Error('tsa_sync_manual_draft_review', 'Manually drafted events cannot be auto-republished', array('status'=>409));
    }
    if ($current['status'] === 'publish' && tsa_sync_state_matches_fields($current, $expected)) {
        return rest_ensure_response(array('accepted'=>true,'dry_run'=>false,'action'=>'upsert',
            'operation'=>'unchanged','mapping_status'=>'mapped','external_id'=>$id,'post_id'=>$post_id));
    }
    // Date moves must not collide with any manual event (including drafts).
    if (substr($current['start'], 0, 10) !== $data['event_date'] &&
        tsa_sync_day_has_manual_event($data['event_date'])) {
        return new WP_Error('tsa_sync_manual_day_collision', 'Target date includes a manually managed event', array('status'=>409));
    }
    // Hide a published event before any changes; failed checks leave it in
    // DRAFT, never with partially updated public details.
    if ($current['status'] === 'publish') {
        $hidden = wp_update_post(array('ID'=>$post_id, 'post_status'=>'draft'), true);
        if (is_wp_error($hidden) || (int) $hidden !== $post_id ||
            !get_post($post_id) || get_post($post_id)->post_status !== 'draft') {
            return new WP_Error('tsa_sync_hide_failed','Could not safely stage update as draft',array('status'=>502));
        }
    }
    $repo = tribe_events();
    if (!is_object($repo) || !method_exists($repo,'where') || !method_exists($repo,'set_args') || !method_exists($repo,'save')) {
        return new WP_Error('tsa_sync_update_api_missing', 'TEC update API unavailable; event kept as draft',array('status'=>502));
    }
    // Some TEC releases return NULL from save() even when data is persisted.
    // Never trust the return value by itself: verify actual post and TEC meta.
    try {
        $repo->where('id',$post_id)->where('post_status','draft')->set_args($tec)->save();
    } catch (Throwable $e) {
        return new WP_Error('tsa_sync_update_api_failed','TEC update failed; event kept as draft',array('status'=>502));
    }
    $staged = get_post($post_id);
    if (!$staged || $staged->post_status !== 'draft' ||
        $staged->post_title !== $expected['title'] || $staged->post_content !== $expected['description'] ||
        !tsa_sync_event_dates_match($post_id, $expected_start, $expected_end)) {
        return new WP_Error('tsa_sync_update_date_integrity','TEC update did not persist correct post and dates; left as draft',array('status'=>502));
    }
    $theme = get_post_meta($post_id,'wpos_event',true);
    if (!is_array($theme)) $theme = array();
    foreach (array('place','open','start','price') as $key) {
        $state_key = $key === 'start' ? 'theme_start' : $key;
        $theme[$key] = $expected[$state_key];
    }
    update_post_meta($post_id,'wpos_event',$theme);
    $old_flyer_path = $current['flyer_path'];
    if ($old_flyer_path !== $expected['flyer_path']) {
        if ($expected['flyer_path'] === '') {
            delete_post_thumbnail($post_id);
        } else {
            $new_media = tsa_sync_attach_flyer($post_id, $expected['flyer_path']);
            if (is_wp_error($new_media)) return $new_media;
        }
    }
    $after_staging = tsa_sync_current_public_state($post_id);
    if (!$after_staging || $after_staging['status'] !== 'draft' ||
        get_post_meta($post_id, '_tsa_sync_external_id', true) !== $id ||
        !tsa_sync_state_matches_fields($after_staging, $expected) ||
        !tsa_sync_event_dates_match($post_id, $expected_start, $expected_end)) {
        return new WP_Error('tsa_sync_staging_integrity','Staged event fields mismatch; event kept as draft',array('status'=>502));
    }
    $published = wp_update_post(array('ID'=>$post_id, 'post_status'=>'publish'), true);
    if (is_wp_error($published) || (int) $published !== $post_id) {
        return new WP_Error('tsa_sync_republish_failed','Staged event could not be published',array('status'=>502));
    }
    $after_publish = tsa_sync_current_public_state($post_id);
    if (!$after_publish || $after_publish['status'] !== 'publish' ||
        !tsa_sync_state_matches_fields($after_publish, $expected) ||
        !tsa_sync_event_dates_match($post_id, $expected_start, $expected_end) ||
        get_post_meta($post_id,'_tsa_sync_external_id',true) !== $id) {
        wp_update_post(array('ID'=>$post_id, 'post_status'=>'draft'), true);
        return new WP_Error('tsa_sync_after_publish_integrity','Published fields mismatched; event moved back to draft',array('status'=>502));
    }
    update_post_meta($post_id, '_tsa_sync_verified_start', $expected_start);
    update_post_meta($post_id, '_tsa_sync_state_v1', $after_publish);
    if (!tsa_sync_snapshot_is_unchanged($post_id, $after_publish)) {
        wp_update_post(array('ID'=>$post_id, 'post_status'=>'draft'), true);
        return new WP_Error('tsa_sync_snapshot_failed','Update succeeded but tracking failed; event moved to draft',array('status'=>502));
    }
    delete_post_meta($post_id, '_tsa_sync_unpublished_by_sync');
    tsa_sync_canary_stage($id, 'updated');
    return rest_ensure_response(array('accepted'=>true,'dry_run'=>false,'action'=>'upsert',
        'operation'=>'updated','mapping_status'=>'mapped','external_id'=>$id,'post_id'=>$post_id,
        'featured_image_id'=>(int)get_post_thumbnail_id($post_id),'event_url'=>get_permalink($post_id)));
}

function tsa_sync_write_event($data, $request) {
    if (!function_exists('tribe_events')) {
        return new WP_Error('tsa_sync_tec_orm_missing', 'The Events Calendar event repository is unavailable', array('status' => 409));
    }
    $id = $data['external_id'];
    $nonce = $request->get_header('x-tsa-nonce');
    if (!is_string($nonce) || !preg_match('/^[a-f0-9]{32}$/', $nonce)) {
        return new WP_Error('tsa_sync_nonce', 'Invalid request nonce', array('status' => 401));
    }
    $nonce_key = 'tsa_sync_nonce_' . hash('sha256', $nonce);
    if (!add_option($nonce_key, time(), '', 'no')) {
        return new WP_Error('tsa_sync_replay', 'Already processed request', array('status' => 409));
    }
    $lock = 'tsa_sync_lock_' . hash('sha256', $id);
    if (!add_option($lock, time(), '', 'no')) {
        $prior = get_option($lock, 0);
        if (is_numeric($prior) && (int) $prior > 0 && time() - (int) $prior > 120) {
            delete_option($lock);
        }
        if (!add_option($lock, time(), '', 'no')) {
            return new WP_Error('tsa_sync_busy', 'Event sync in progress; retry later', array('status' => 409));
        }
    }
    try {
        // Re-check INSIDE the lock: distinct signed nonces may race for the same event.
        $found = get_posts(array(
            'post_type' => 'tribe_events',
            'post_status' => array('publish','future','draft','pending','private','trash'),
            'numberposts' => 2,
            'fields' => 'ids',
            'meta_key' => '_tsa_sync_external_id',
            'meta_value' => $id,
            'suppress_filters' => true,
        ));
        if (count($found) > 1) return new WP_Error('tsa_sync_duplicate', 'Duplicate mapped events', array('status' => 409));
        $post_id = count($found) === 1 ? (int) $found[0] : 0;
        $match = $post_id ? 'mapped' : 'none';
        if ($post_id) {
            $post = get_post($post_id);
            if (!$post || $post->post_type !== 'tribe_events') return new WP_Error('tsa_sync_mapping_invalid', 'Mapped event is invalid', array('status' => 409));
            if ($post->post_status === 'trash' && $data['action'] === 'upsert') return new WP_Error('tsa_sync_trashed', 'Trashed mapped event requires review', array('status' => 409));
        }
        // Existing mappings created by v0.2.0 did not verify date metadata.
        // Never overwrite a WordPress event the owner has manually corrected.
        if ($post_id && get_post_meta($post_id, '_tsa_sync_verified_start', true) === '') {
            return new WP_Error('tsa_sync_legacy_mapping_review', 'Existing mapped event needs manual review', array('status'=>409));
        }
        if ($data['action'] === 'unpublish') {
            if ($post_id) {
                $prior = get_post_meta($post_id, '_tsa_sync_state_v1', true);
                if (is_array($prior) && !tsa_sync_snapshot_is_unchanged($post_id, tsa_sync_current_public_state($post_id))) {
                    return new WP_Error('tsa_sync_manual_edit_conflict', 'WordPress data changed since last sync; manual review required', array('status'=>409));
                }
            }
            if ($post_id && $post->post_status !== 'trash' && $post->post_status !== 'draft') {
                $updated = wp_update_post(array('ID' => $post_id, 'post_status' => 'draft'), true);
                if (is_wp_error($updated) || (int) $updated !== $post_id) {
                    return new WP_Error('tsa_sync_write_failed', 'Could not unpublish event', array('status' => 502));
                }
                $after = get_post($post_id);
                if (!$after || $after->post_status !== 'draft' || get_post_meta($post_id, '_tsa_sync_external_id', true) !== $id) {
                    return new WP_Error('tsa_sync_unpublish_integrity', 'Unpublish result or event mapping could not be verified', array('status' => 502));
                }
                $prior_snapshot = get_post_meta($post_id, '_tsa_sync_state_v1', true);
                if (is_array($prior_snapshot)) {
                    $new_snapshot = tsa_sync_current_public_state($post_id);
                    update_post_meta($post_id, '_tsa_sync_state_v1', $new_snapshot);
                    update_post_meta($post_id, '_tsa_sync_unpublished_by_sync', '1');
                }
                // Mark only a verified transition from a public post to draft.
                tsa_sync_canary_stage($id, 'unpublished');
            }
            return rest_ensure_response(array('accepted'=>true,'dry_run'=>false,'action'=>'unpublish',
                'operation'=>($post_id && $post->post_status !== 'trash' && $post->post_status !== 'draft') ? 'unpublished' : 'no_change',
                'external_id'=>$id,'mapping_status'=>$match,'post_id'=>$post_id));
        }
        // Fail closed before create if there is an existing human-maintained event.
        if (!$post_id) {
            $legacy = get_posts(array(
                'post_type'=>'tribe_events',
                'post_status'=>array('publish','future','draft','pending','private','trash'),
                'numberposts'=>100, 'fields'=>'ids', 's'=>$data['title'], 'suppress_filters'=>true,
            ));
            if (count($legacy) >= 100) return new WP_Error('tsa_sync_search_limit', 'Manual event reconciliation required', array('status'=>409));
            foreach ($legacy as $candidate) {
                $p = get_post($candidate);
                if (!$p || trim(wp_strip_all_tags($p->post_title)) !== trim($data['title'])) continue;
                $old_date = get_post_meta($candidate, '_EventStartDate', true);
                if (!is_string($old_date) || $old_date === '' || substr($old_date,0,10) === $data['event_date']) {
                    return new WP_Error('tsa_sync_legacy_collision', 'Existing event must be reconciled manually', array('status'=>409));
                }
            }
        }
        if (!$post_id && tsa_sync_day_has_manual_event($data['event_date'])) {
            return new WP_Error('tsa_sync_manual_day_collision', 'Existing manual event on the same date requires review', array('status'=>409));
        }
        // No invented public start times. The owner must set START before publishing.
        $date = $data['event_date'];
        $start = isset($data['start_time']) ? $data['start_time'] : null;
        $open = isset($data['open_time']) ? $data['open_time'] : null;
        if (!is_string($start) || !preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $start)) {
            return new WP_Error('tsa_sync_start_missing', 'START time is required before publication', array('status'=>422));
        }
        if ($open !== null && (!is_string($open) || !preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $open))) {
            return new WP_Error('tsa_sync_open_invalid', 'Invalid OPEN time', array('status'=>422));
        }
        $description = isset($data['public_description']) ? $data['public_description'] : '';
        $venue = isset($data['venue']) ? $data['venue'] : '';
        if (!is_string($description) || strlen($description) > 50000 || !is_string($venue) || strlen($venue) > 1200) {
            return new WP_Error('tsa_sync_invalid_text', 'Invalid public event text', array('status'=>422));
        }
        foreach (array('advance_price','door_price') as $key) {
            if (isset($data[$key]) && (!is_int($data[$key]) || $data[$key] < 0 || $data[$key] > 10000000)) {
                return new WP_Error('tsa_sync_invalid_price', 'Invalid public price', array('status'=>422));
            }
        }
        $start_at = new DateTimeImmutable($date . ' ' . $start . ':00', new DateTimeZone('Asia/Tokyo'));
        // TEC requires an end date. The app has no end field; +1h is a calendar-only
        // technical placeholder, NOT a public claim about actual show duration.
        $end_at = $start_at->modify('+1 hour');
        // The legacy tribe_create_event() path produced a 1970 date on the
        // production site. Use the documented TEC event repository instead.
        $tec = array(
            'title' => sanitize_text_field($data['title']),
            'description' => wp_kses_post($description),
            'status' => 'draft',
            // Explicitly require a timed event (not an all-day event).
            'all_day' => false,
            'start_date' => $start_at->format('Y-m-d H:i:s'),
            'end_date' => $end_at->format('Y-m-d H:i:s'),
            'timezone' => 'Asia/Tokyo',
        );
        // Matched events are updated in place only after snapshot/conflict checks.
        if ($post_id) {
            return tsa_sync_update_mapped_event($post_id, $id, $data, $tec,
                $start_at->format('Y-m-d H:i:s'), $end_at->format('Y-m-d H:i:s'));
        }
        $created = tribe_events()->set_args($tec)->create();
        if (!is_object($created) || empty($created->ID) || (int) $created->ID <= 0) {
            return new WP_Error('tsa_sync_create_failed', 'The Events Calendar could not create a draft event', array('status'=>502));
        }
        $post_id = (int) $created->ID;
        $created_post = get_post($post_id);
        if (!$created_post || $created_post->post_type !== 'tribe_events' || $created_post->post_status !== 'draft') {
            // Fail closed: a misconfigured ORM must never leave an unchecked
            // event published. Attempt to hide just the newly created post.
            wp_update_post(array('ID'=>$post_id, 'post_status'=>'draft'), true);
            return new WP_Error('tsa_sync_unexpected_draft_state', 'Could not verify safe draft state', array('status'=>502));
        }
        $expected_start = $start_at->format('Y-m-d H:i:s');
        $expected_end = $end_at->format('Y-m-d H:i:s');
        if (!tsa_sync_event_dates_match($post_id, $expected_start, $expected_end)) {
            // This draft was created by this request and has never published.
            // Deleting it prevents accumulating invisible 1970-dated drafts.
            wp_delete_post($post_id, true);
            return new WP_Error('tsa_sync_date_integrity', 'TEC stored dates do not match the requested event date', array('status'=>502));
        }
        update_post_meta($post_id, '_tsa_sync_verified_start', $expected_start);
        update_post_meta($post_id, '_tsa_sync_external_id', $id);
        update_post_meta($post_id, '_tsa_sync_placeholder_end', '1');
        $theme = get_post_meta($post_id, 'wpos_event', true);
        if (!is_array($theme)) $theme = array();
        $theme['place'] = sanitize_text_field($venue);
        $theme['open'] = tsa_sync_format_open_start($open, $start);
        // Keep a separate START key for compatibility with other theme code,
        // but the visible "開場/開演" field is the combined string above.
        $theme['start'] = $start;
        $adv = isset($data['advance_price']) ? (int) $data['advance_price'] : null;
        $door = isset($data['door_price']) ? (int) $data['door_price'] : null;
        $theme['price'] = ($adv !== null ? 'adv. ￥' . number_format($adv) : '') .
            ($door !== null ? ' door ￥' . number_format($door) : '');
        update_post_meta($post_id, 'wpos_event', $theme);
        $saved_theme = get_post_meta($post_id, 'wpos_event', true);
        if (!is_array($saved_theme) || !isset($saved_theme['open'], $saved_theme['start']) ||
            $saved_theme['open'] !== $theme['open'] || $saved_theme['start'] !== $start) {
            // Do not publish a newly created event with missing/mismatched OPEN/START.
            wp_delete_post($post_id, true);
            return new WP_Error('tsa_sync_open_start_integrity', 'OPEN/START could not be stored correctly', array('status'=>502));
        }
        // The public monthly schedule uses the WordPress featured image. Import
        // it while this newly created event is still a draft.
        $flyer_path = array_key_exists('flyer_path', $data) ? $data['flyer_path'] : null;
        $attachment_id = tsa_sync_attach_flyer($post_id, $flyer_path);
        if (is_wp_error($attachment_id)) {
            wp_delete_post($post_id,true);
            return $attachment_id;
        }
        // XO Slider 6647 is hand-managed in WordPress. No event category,
        // slider, or ordering changes are performed by this integration.
        // Make new posts visible only AFTER mapping and theme fields are saved.
        if ($match === 'none') {
            $published = wp_update_post(array('ID'=>$post_id,'post_status'=>'publish'), true);
            if (is_wp_error($published)) {
                if ($attachment_id) wp_delete_attachment($attachment_id,true);
                return new WP_Error('tsa_sync_publish_failed','Event created as draft but publish failed',array('status'=>502));
            }
            if (!tsa_sync_event_dates_match($post_id, $expected_start, $expected_end)) {
                wp_update_post(array('ID'=>$post_id, 'post_status'=>'draft'), true);
                return new WP_Error('tsa_sync_date_integrity', 'Publication altered the stored event datetime or all-day flag; moved back to draft', array('status'=>502));
            }
            // WordPress hooks fired during publication must not remove the
            // featured image after the draft was verified.
            if ($attachment_id && (int) get_post_thumbnail_id($post_id) !== $attachment_id) {
                wp_update_post(array('ID'=>$post_id, 'post_status'=>'draft'), true);
                return new WP_Error('tsa_sync_flyer_after_publish', 'Publication removed featured image; moved back to draft',array('status'=>502));
            }
            $public_theme = get_post_meta($post_id, 'wpos_event', true);
            if (!is_array($public_theme) || !isset($public_theme['open'], $public_theme['start']) ||
                $public_theme['open'] !== $theme['open'] || $public_theme['start'] !== $start) {
                wp_update_post(array('ID'=>$post_id, 'post_status'=>'draft'), true);
                return new WP_Error('tsa_sync_open_start_integrity', 'Publication altered OPEN/START; moved back to draft', array('status'=>502));
            }
        }
        $snapshot = tsa_sync_current_public_state($post_id);
        if (!$snapshot || $snapshot['status'] !== 'publish' ||
            !tsa_sync_state_matches_fields($snapshot,
                tsa_sync_expected_public_fields($data, $expected_start, $expected_end))) {
            wp_update_post(array('ID'=>$post_id, 'post_status'=>'draft'), true);
            return new WP_Error('tsa_sync_snapshot_initial','Cannot verify new event tracking; event moved to draft',array('status'=>502));
        }
        update_post_meta($post_id, '_tsa_sync_state_v1', $snapshot);
        if (!tsa_sync_snapshot_is_unchanged($post_id, $snapshot)) {
            wp_update_post(array('ID'=>$post_id, 'post_status'=>'draft'), true);
            return new WP_Error('tsa_sync_snapshot_initial','Cannot persist new event tracking; moved to draft',array('status'=>502));
        }
        if (get_option('tsa_sync_write_mode', 'dry_run') === 'single') {
            update_option('tsa_sync_single_succeeded', 'yes', false);
            tsa_sync_canary_stage($id, 'created');
        }
        return rest_ensure_response(array(
            'accepted'=>true,'dry_run'=>false,'action'=>'upsert','external_id'=>$id,
            'mapping_status'=>$match,'operation'=>'created','post_id'=>$post_id,'event_url'=>get_permalink($post_id),
            'featured_image_id'=>$attachment_id,
        ));
    } finally {
        delete_option($lock);
    }
}

// Bounds replay marker storage; deletes ONLY known nonce options older than 24h.
add_action('tsa_sync_cleanup_nonces', function () {
    global $wpdb;
    $like = $wpdb->esc_like('tsa_sync_nonce_') . '%';
    $names = $wpdb->get_col($wpdb->prepare(
        "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s LIMIT 200", $like
    ));
    foreach ($names as $name) {
        if (!preg_match('/^tsa_sync_nonce_[a-f0-9]{64}$/', $name)) continue;
        $value = get_option($name, null);
        if (is_numeric($value) && (int) $value > 0 && time() - (int) $value > 86400) {
            delete_option($name);
        }
    }
});
add_action('init', function () {
    if (get_option('tsa_sync_write_mode', 'dry_run') === 'dry_run') return;
    if (!wp_next_scheduled('tsa_sync_cleanup_nonces')) {
        wp_schedule_event(time() + 3600, 'hourly', 'tsa_sync_cleanup_nonces');
    }
});

add_action('admin_menu', function () {
    add_management_page('TSA Event Sync', 'TSA Event Sync', 'manage_options', 'tsa-event-sync', 'tsa_sync_admin_page');
});
function tsa_sync_admin_page() {
    if (!current_user_can('manage_options')) { return; }
    $new_secret = '';
    $error = '';
    if (isset($_POST['tsa_sync_generate_secret'])) {
        check_admin_referer('tsa_sync_generate_secret');
        if (defined('TSA_EVENT_SYNC_SECRET')) {
            $error = 'wp-config.php にシークレットが設定されているため、こちらから変更できません。';
        } else {
            try {
                $new_secret = bin2hex(random_bytes(32));
                if (get_option('tsa_sync_signing_secret', false) === false) {
                    $saved = add_option('tsa_sync_signing_secret', $new_secret, '', 'no');
                } else {
                    $saved = update_option('tsa_sync_signing_secret', $new_secret, false);
                }
                if (!$saved) {
                    $new_secret = '';
                    $error = '保存できませんでした。再度お試しください。';
                }
            } catch (Exception $e) {
                $new_secret = '';
                $error = '安全なシークレットを生成できませんでした。';
            }
        }
    }
    if (isset($_POST['tsa_sync_save_mode'])) {
        check_admin_referer('tsa_sync_save_mode');
        $requested = isset($_POST['tsa_sync_mode']) ? sanitize_key(wp_unslash($_POST['tsa_sync_mode'])) : 'dry_run';
        $single = isset($_POST['tsa_sync_single_id']) ? sanitize_text_field(wp_unslash($_POST['tsa_sync_single_id'])) : '';
        if (!in_array($requested, array('dry_run','single','all'), true)) {
            $error = '不正なモードです。';
        } elseif ($requested === 'single' && !preg_match('/^[0-9a-fA-F-]{36}$/', $single)) {
            $error = '単独テストにはイベントのUUIDを入力してください。';
        } elseif ($requested === 'all' && !tsa_sync_canary_complete()) {
            $error = '指定イベント1件で新規登録・更新・公開解除の3段階テストが完了するまで全許可にはできません。';
        } elseif ($requested === 'all' && !isset($_POST['tsa_sync_ack_all'])) {
            $error = '全イベント公開には確認チェックが必要です。';
        } elseif (!tsa_sync_configured() && $requested !== 'dry_run') {
            $error = '署名用シークレットが設定されていません。';
        } else {
            $old_id = get_option('tsa_sync_single_external_id', '');
            if ($requested === 'single' && $old_id !== $single) tsa_sync_reset_canary();
            if ($requested === 'single') update_option('tsa_sync_single_external_id', $single, false);
            update_option('tsa_sync_write_mode', $requested, false);
        }
    }
    echo '<div class="wrap"><h1>TSA Event Sync / 公開設定</h1>';
    echo '<p><strong>プラグイン有効化：</strong>完了</p>';
    echo '<div class="notice notice-warning"><p><strong>v0.2.9：</strong>更新直後は接続テストのみ。新規登録・更新・公開解除の一件テストをすべて成功させ、管理者が明示的に許可するまで全イベント連携は開始しません。既存の手動イベントは自動上書きしません。</p></div>';
    echo '<p><strong>署名用シークレット：</strong>' . (tsa_sync_configured() ? '設定済み' : '未設定') . '</p>';
    // Only administrators can see this short, non-secret HMAC fingerprint.
    // It allows comparison with Vercel's owner-only diagnostic, without copying
    // the secret or exposing raw request details.
    if (tsa_sync_configured()) {
        $key_check = strtoupper(substr(hash_hmac('sha256', 'tsa-sync-key-fingerprint-v1', tsa_sync_signing_secret()), 0, 12));
        echo '<p><strong>接続確認コード：</strong> <code>' . esc_html($key_check) . '</code></p>';
        echo '<p>この12文字をアプリの接続診断コードと照合してください。シークレット本体ではありません。</p>';
    }

    $mode = get_option('tsa_sync_write_mode', 'dry_run');
    $single = get_option('tsa_sync_single_external_id', '');
    echo '<p><strong>ホームページのイベント更新：</strong>' . esc_html($mode === 'all' ? '全許可' : ($mode === 'single' ? '指定イベント1件のみ' : '無効（安全確認モード）')) . '</p>';
    echo '<p>テスト対象イベント1件で「新規登録→内容更新→公開解除」をすべて確認した後に限り、全イベント許可を選択できます。既存の手動イベントは自動的に上書きしません。</p>';
    $canary_id = get_option('tsa_sync_single_external_id', '');
    echo '<p><strong>1件限定テスト進捗：</strong> ';
    foreach (array('created'=>'新規登録','updated'=>'更新','unpublished'=>'公開解除') as $stage=>$label) {
        $pass = is_string($canary_id) && $canary_id !== '' && get_option('tsa_sync_canary_' . $stage . '_id', '') === $canary_id;
        echo esc_html($label) . ': ' . ($pass ? 'OK' : '未確認') . ' / ';
    }
    echo '</p>';
    echo '<form method="post">';
    wp_nonce_field('tsa_sync_save_mode');
    echo '<h2>イベント更新モード</h2>';
    echo '<p><label><input type="radio" name="tsa_sync_mode" value="dry_run" ' . checked($mode,'dry_run',false) . '> 接続テストのみ（推奨）</label></p>';
    echo '<p><label><input type="radio" name="tsa_sync_mode" value="single" ' . checked($mode,'single',false) . '> 指定イベント1件だけ公開を許可</label></p>';
    echo '<p><label>テスト公開するイベントのID：<input style="width:390px;max-width:100%" name="tsa_sync_single_id" value="' . esc_attr($single) . '" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label></p>';
    if (tsa_sync_canary_complete()) {
        echo '<p><label><input type="radio" name="tsa_sync_mode" value="all" ' . checked($mode,'all',false) . '> 全イベントのHP連携を許可（テスト完了後の本番モード）</label></p>';
        echo '<p><label><input type="checkbox" name="tsa_sync_ack_all" value="1"> 本番連携を開始することを理解しています（別途Vercel本番スイッチの設定が必要）</label></p>';
    } else {
        echo '<p><strong>全イベント許可は現在ロック中です。</strong>3段階のテスト完了で選択可能になります。</p>';
    }
    echo '<p><button type="submit" name="tsa_sync_save_mode" value="1" class="button button-primary">更新モードを保存</button></p></form>';

    // Read-only inspection of TEC's saved metadata for one previously created
    // event. No database writes, network actions, or secret disclosure.
    echo '<hr><h2>日時・終日設定の診断（読み取り専用）</h2>';
    echo '<p>WordPress投稿IDを入力すると、The Events Calendarが保存した日時と終日判定を確認できます。診断してもイベントは変更されません。</p>';
    echo '<form method="get">';
    echo '<input type="hidden" name="page" value="tsa-event-sync">';
    $diagnose_id = isset($_GET['tsa_sync_diagnose_id']) ? absint(wp_unslash($_GET['tsa_sync_diagnose_id'])) : 0;
    echo '<label>WordPress投稿ID <input type="number" min="1" step="1" name="tsa_sync_diagnose_id" value="' . ($diagnose_id ? esc_attr((string) $diagnose_id) : '') . '" placeholder="10089"></label> ';
    echo '<button type="submit" class="button">日時を診断する</button>';
    echo '</form>';
    if ($diagnose_id > 0) {
        $diagnosed_post = get_post($diagnose_id);
        if (!$diagnosed_post || $diagnosed_post->post_type !== 'tribe_events') {
            echo '<p>対象のイベント投稿が見つかりません。</p>';
        } else {
            echo '<table class="widefat striped" style="max-width:900px"><tbody>';
            $diag = array(
                '投稿ID' => (string) $diagnose_id,
                '公開状態' => (string) $diagnosed_post->post_status,
            );
            foreach (array('_EventStartDate', '_EventEndDate', '_EventStartDateUTC', '_EventEndDateUTC', '_EventTimezone', '_EventAllDay') as $meta_key) {
                $meta_value = get_post_meta($diagnose_id, $meta_key, true);
                $diag[$meta_key] = is_scalar($meta_value) ? (string) $meta_value : '[non-scalar]';
                if ($diag[$meta_key] === '') { $diag[$meta_key] = '(空欄または未設定)'; }
            }
            if (function_exists('tribe_event_is_all_day')) {
                $diag['TEC終日判定（tribe_event_is_all_day）'] = tribe_event_is_all_day($diagnose_id) ? 'YES（終日）' : 'NO（時間指定）';
            } else {
                $diag['TEC終日判定'] = '判定関数なし';
            }
            if (function_exists('tribe_get_event')) {
                $tec_event = tribe_get_event($diagnose_id);
                if (is_object($tec_event) && isset($tec_event->all_day)) {
                    $diag['TECイベントのall_day'] = $tec_event->all_day ? 'YES（終日）' : 'NO（時間指定）';
                } else {
                    $diag['TECイベントのall_day'] = '取得できません';
                }
            }
            $theme_info = get_post_meta($diagnose_id, 'wpos_event', true);
            if (is_array($theme_info)) {
                $diag['テーマの開場/開演'] = isset($theme_info['open']) && is_scalar($theme_info['open']) ? (string) $theme_info['open'] : '(未設定)';
                $diag['テーマのSTART'] = isset($theme_info['start']) && is_scalar($theme_info['start']) ? (string) $theme_info['start'] : '(未設定)';
            }
            $thumbnail_id = (int) get_post_thumbnail_id($diagnose_id);
            $diag['アイキャッチ画像ID'] = $thumbnail_id > 0 ? (string)$thumbnail_id : '(未設定)';
            $diag['PICKUPカテゴリ'] = has_term('PICKUP','tribe_events_cat',$diagnose_id) ? 'YES' : 'NO';
            foreach ($diag as $label => $value) {
                echo '<tr><th style="width:42%">' . esc_html($label) . '</th><td><code>' . esc_html($value) . '</code></td></tr>';
            }
            echo '</tbody></table>';
            echo '<p><strong>注意：</strong>この表示は保存データの診断結果です。管理画面の「終日です」と異なる場合は、表示側やキャッシュの調査が必要です。診断だけでは公開を再開しないでください。</p>';
        }
    }

    if ($error !== '') {
        echo '<div class="notice notice-error"><p>' . esc_html($error) . '</p></div>';
    }
    if ($new_secret !== '') {
        echo '<div class="notice notice-success"><p><strong>シークレットを生成・保存しました。</strong>この画面を閉じると再表示できません。</p></div>';
        echo '<p>下の値をコピーして Vercel の <code>WORDPRESS_SYNC_SECRET</code> に登録してください。チャットやスクリーンショットには絶対に含めないでください。</p>';
        echo '<p><input id="tsa-one-time-secret" type="password" readonly autocomplete="off" spellcheck="false" aria-label="生成された署名用シークレット" style="width:540px;max-width:100%" value="' . esc_attr($new_secret) . '"></p>';
        echo '<p><button type="button" id="tsa-copy-secret" class="button button-primary">シークレットをコピー</button> <button type="button" id="tsa-select-secret" class="button">手動で選択</button> <span id="tsa-copy-status" role="status" aria-live="polite"></span></p>';
        echo '<p><small>「シークレットをコピー」を押した後、Vercel の Value 欄に貼り付けてください。失敗した場合は「手動で選択」→ Mac は ⌘C を押してください。</small></p>';
        echo '<script>(function(){"use strict";var el=document.getElementById("tsa-one-time-secret");var copy=document.getElementById("tsa-copy-secret");var select=document.getElementById("tsa-select-secret");var status=document.getElementById("tsa-copy-status");if(!el||!copy||!select||!status)return;function selectSecret(){el.focus();el.select();el.setSelectionRange(0,el.value.length);}function show(message){status.textContent=message;}select.addEventListener("click",function(){selectSecret();show("全選択しました。Mac は ⌘C でコピーしてください。");});copy.addEventListener("click",async function(){try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(el.value);show("コピーしました。Vercel の Value 欄に貼り付けてください。");return;}}catch(e){}selectSecret();try{if(document.execCommand("copy")){show("コピーしました。Vercel の Value 欄に貼り付けてください。");return;}}catch(e){}show("自動コピーできませんでした。選択中の値を ⌘C でコピーしてください。");});})();</script>';
        echo '<p><strong>注意：</strong>再生成すると、Vercel 側も同じ値に更新するまで同期が失敗します。</p>';
    }
    if (!defined('TSA_EVENT_SYNC_SECRET')) {
        echo '<form method="post">';
        wp_nonce_field('tsa_sync_generate_secret');
        echo '<p><button type="submit" name="tsa_sync_generate_secret" value="1" class="button button-primary">' . (tsa_sync_configured() ? 'シークレットを再生成' : '署名用シークレットを生成') . '</button></p>';
        echo '</form>';
    } else {
        echo '<p>このサイトでは wp-config.php の定数が優先されます。設定を変更する場合はサーバー管理者に依頼してください。</p>';
    }
    echo '<h2>Vercel の接続設定</h2>';
    echo '<p>対象プロジェクト：<code>livehouse-event-manager-app</code>。Vercel 管理画面の Settings → Environment Variables に以下を設定してください。</p>';
    echo '<ul style="list-style:disc;padding-left:24px">';
    echo '<li><code>WORDPRESS_SYNC_ENDPOINT</code> = <code>https://thunder-snake.com/wp-json/tsa-sync/v1/events</code></li>';
    echo '<li><code>WORDPRESS_SYNC_SECRET</code> = 上で生成した値（Vercel の機密変数として設定）</li>';
    echo '<li><code>WORDPRESS_SYNC_STAGING_ENABLED</code> = <code>true</code>（Preview検証専用）</li>';
    echo '<li><code>WORDPRESS_SYNC_PRODUCTION_ENABLED</code> = <code>true</code>（WordPressで全許可に切り替えた後、本番のみに設定。未設定なら送信停止）</li>';
    echo '</ul>';
    echo '<p>Vercel 側への設定後、再デプロイが必要です。認証テストが成功するまでは本番公開を有効にしないでください。</p>';
    echo '<p>秘密鍵、パスワード、APIキーをチャットやスクリーンショットに含めないでください。</p>';
    echo '</div>';
}
