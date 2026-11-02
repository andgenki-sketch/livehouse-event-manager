<?php
/**
 * Plugin Name: TSA Event Sync Receiver (Staging)
 * Description: Disabled-by-default authenticated event sync receiver for testing.
 * Version: 0.1.0
 */
defined('ABSPATH') || exit;

/**
 * Configure TSA_EVENT_SYNC_SECRET in wp-config.php (32+ random characters).
 * The receiver does not register unless the secret is configured.
 */
add_action('rest_api_init', function () {
    if (!defined('TSA_EVENT_SYNC_SECRET') || !is_string(TSA_EVENT_SYNC_SECRET) || strlen(TSA_EVENT_SYNC_SECRET) < 32) {
        return;
    }
    register_rest_route('tsa-sync/v1', '/events', array(
        'methods' => 'POST',
        'callback' => 'tsa_sync_receive_event',
        'permission_callback' => 'tsa_sync_authenticate',
    ));
});

// Replay nonce options are permanent until explicitly cleaned by an administrator.
// This avoids unsafe wildcard database deletion; cleanup must be implemented and tested
// separately before enabling live writes.
function tsa_sync_authenticate($request) {
    $timestamp = $request->get_header('x-tsa-timestamp');
    $signature = $request->get_header('x-tsa-signature');
    $nonce = $request->get_header('x-tsa-nonce');
    if (!is_string($timestamp) || !preg_match('/^[0-9]{10}$/', $timestamp) ||
        abs(time() - (int) $timestamp) > 300 ||
        !is_string($nonce) || !preg_match('/^[a-f0-9]{32}$/', $nonce) ||
        !is_string($signature) || !preg_match('/^sha256=[a-f0-9]{64}$/', $signature)) {
        return new WP_Error('tsa_sync_unauthorized', 'Unauthorized', array('status' => 401));
    }
    $expected = 'sha256=' . hash_hmac('sha256', $timestamp . '.' . $nonce . '.' . $request->get_body(), TSA_EVENT_SYNC_SECRET);
    if (!hash_equals($expected, $signature)) {
        return new WP_Error('tsa_sync_unauthorized', 'Unauthorized', array('status' => 401));
    }
    return true;
}

/**
 * Safe staging receiver: validate and acknowledge only; no WordPress posts
 * or media are written until the existing theme metadata mapping is reviewed.
 */
function tsa_sync_receive_event($request) {
    $data = json_decode($request->get_body(), true);
    if (!is_array($data) || !isset($data['external_id'], $data['action']) ||
        !is_string($data['external_id']) ||
        !preg_match('/^[a-zA-Z0-9_-]{1,100}$/', $data['external_id']) ||
        !in_array($data['action'], array('upsert', 'unpublish'), true)) {
        return new WP_Error('tsa_sync_invalid', 'Invalid event request', array('status' => 400));
    }
    if ($data['action'] === 'upsert') {
        if (empty($data['title']) || !is_string($data['title']) ||
            empty($data['event_date']) || !is_string($data['event_date']) ||
            !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['event_date'])) {
            return new WP_Error('tsa_sync_invalid', 'Invalid public event fields', array('status' => 400));
        }
    }
    // Read-only duplicate assessment. Never attach a manual event by title/date.
    // The external ID will become the canonical mapping key once writes are enabled.
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
        return new WP_Error('tsa_sync_duplicate_mapping', 'Duplicate external event mappings', array('status' => 409));
    }
    $match = 'none';
    if (count($existing) === 1) {
        $match = 'mapped';
    } elseif ($data['action'] === 'upsert') {
        // Potential legacy event collision: requires manual review before upsert.
        $legacy = get_posts(array(
            'post_type' => 'tribe_events',
            'post_status' => array('publish', 'future', 'draft', 'pending', 'private'),
            'numberposts' => 100,
            'fields' => 'ids',
            's' => $data['title'],
            'suppress_filters' => true,
        ));
        foreach ($legacy as $legacy_id) {
            $legacy_post = get_post($legacy_id);
            if (!$legacy_post || trim(wp_strip_all_tags($legacy_post->post_title)) !== trim($data['title'])) {
                continue;
            }
            // The Events Calendar stores its canonical date in _EventStartDate.
            // Only an exact title AND same local event date needs manual reconciliation.
            $legacy_start = get_post_meta($legacy_id, '_EventStartDate', true);
            if (!is_string($legacy_start) || $legacy_start === '' ||
                substr($legacy_start, 0, 10) === $data['event_date']) {
                // Missing canonical date is ambiguous: fail closed for manual review.
                $match = 'review_required';
                break;
            }
        }
    }
    // Fail closed on legacy collisions: no automatic takeover of manually managed posts.
    if ($match === 'review_required') {
        return new WP_Error('tsa_sync_legacy_collision', 'Existing event requires manual mapping', array('status' => 409));
    }

    // Production writes require a separate, explicit server-side switch.
    // The default remains dry-run even with a valid signing secret.
    $writes_enabled = defined('TSA_EVENT_SYNC_ENABLE_WRITES') && TSA_EVENT_SYNC_ENABLE_WRITES === true;
    if ($writes_enabled) {
        $nonce = $request->get_header('x-tsa-nonce');
        if (!is_string($nonce) || !preg_match('/^[a-f0-9]{32}$/', $nonce)) {
            return new WP_Error('tsa_sync_nonce_required', 'Request nonce required', array('status' => 401));
        }
        $nonce_key = 'tsa_sync_nonce_' . hash('sha256', $nonce);
        // add_option is atomic for a unique option_name in WordPress' database.
        // It prevents two simultaneous requests from claiming the same nonce.
        if (!add_option($nonce_key, time(), '', 'no')) {
            return new WP_Error('tsa_sync_replayed', 'Repeated request', array('status' => 409));
        }
        // Options persist intentionally. A periodic cleanup task must be added
        // before high-volume production use to bound storage growth.
        if ($data['action'] === 'unpublish') {
            if (count($existing) === 1) {
                $updated = wp_update_post(array('ID' => $existing[0], 'post_status' => 'draft'), true);
                if (is_wp_error($updated)) return $updated;
            }
        } else {
            $date = $data['event_date'];
            $start = !empty($data['start_time']) ? $data['start_time'] : '00:00';
            if (!preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $start) ||
                !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4))) {
                return new WP_Error('tsa_sync_invalid_date', 'Invalid event date or time', array('status' => 400));
            }
            $start_datetime = $date . ' ' . $start . ':00';
            $end_datetime = (new DateTimeImmutable($start_datetime, new DateTimeZone('Asia/Tokyo')))
                ->modify('+1 hour')->format('Y-m-d H:i:s');
            $post_args = array(
                'post_type' => 'tribe_events',
                'post_status' => 'publish',
                'post_title' => sanitize_text_field($data['title']),
                'post_content' => wp_kses_post(isset($data['public_description']) ? $data['public_description'] : ''),
            );
            if (count($existing) === 1) $post_args['ID'] = $existing[0];
            $post_id = wp_insert_post($post_args, true);
            if (is_wp_error($post_id)) return $post_id;
            update_post_meta($post_id, '_tsa_sync_external_id', $data['external_id']);
            update_post_meta($post_id, '_EventStartDate', $start_datetime);
            update_post_meta($post_id, '_EventEndDate', $end_datetime);
            update_post_meta($post_id, '_EventTimezone', 'Asia/Tokyo');
            // Explicit timezone metadata keeps TEC's UTC queries consistent.
            $tz = new DateTimeZone('Asia/Tokyo');
            $start_utc = (new DateTimeImmutable($start_datetime, $tz))
                ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
            $end_utc = (new DateTimeImmutable($end_datetime, $tz))
                ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
            update_post_meta($post_id, '_EventStartDateUTC', $start_utc);
            update_post_meta($post_id, '_EventEndDateUTC', $end_utc);
            $theme_meta = get_post_meta($post_id, 'wpos_event', true);
            if (!is_array($theme_meta)) $theme_meta = array();
            $theme_meta['place'] = sanitize_text_field(isset($data['venue']) ? $data['venue'] : '');
            $theme_meta['open'] = sanitize_text_field(isset($data['open_time']) ? $data['open_time'] : '');
            $theme_meta['start'] = sanitize_text_field($start);
            $advance = isset($data['advance_price']) && is_numeric($data['advance_price']) ? (int) $data['advance_price'] : null;
            $door = isset($data['door_price']) && is_numeric($data['door_price']) ? (int) $data['door_price'] : null;
            $theme_meta['price'] = ($advance !== null ? 'ADV ¥' . number_format($advance) : '') .
                ($door !== null ? ' / DOOR ¥' . number_format($door) : '');
            update_post_meta($post_id, 'wpos_event', $theme_meta);
            // Existing featured images, taxonomy, and other manual fields are preserved.
        }
        return rest_ensure_response(array(
            'accepted' => true,
            'dry_run' => false,
            'mapping_status' => $match,
            'action' => $data['action'],
            'external_id' => $data['external_id'],
        ));
    }
    return rest_ensure_response(array(
        'accepted' => true,
        'dry_run' => true,
        'mapping_status' => $match,
        'action' => $data['action'],
        'external_id' => $data['external_id'],
    ));
}
