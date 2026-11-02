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

function tsa_sync_authenticate($request) {
    $timestamp = $request->get_header('x-tsa-timestamp');
    $signature = $request->get_header('x-tsa-signature');
    if (!is_string($timestamp) || !preg_match('/^[0-9]{10}$/', $timestamp) ||
        abs(time() - (int) $timestamp) > 300 ||
        !is_string($signature) || !preg_match('/^sha256=[a-f0-9]{64}$/', $signature)) {
        return new WP_Error('tsa_sync_unauthorized', 'Unauthorized', array('status' => 401));
    }
    $expected = 'sha256=' . hash_hmac('sha256', $timestamp . '.' . $request->get_body(), TSA_EVENT_SYNC_SECRET);
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
            'numberposts' => 1,
            'fields' => 'ids',
            'title' => $data['title'],
            'suppress_filters' => true,
        ));
        if (!empty($legacy)) {
            $match = 'review_required';
        }
    }
    return rest_ensure_response(array(
        'accepted' => true,
        'dry_run' => true,
        'mapping_status' => $match,
        'action' => $data['action'],
        'external_id' => $data['external_id'],
    ));
}
