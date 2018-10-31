exports.UNAUTHORIZED_WORKER = (username, password) => ({ connectbtc_code: 'unauthorized_worker', stratum_code: 24, username, password })
exports.WORKER_NAME_MALFORMAT = (username) => ({ connectbtc_code: 'worker_name_malformat', stratum_code: 24, username })
exports.NOT_SUBSCRIBED = (method) => ({ connectbtc_code: 'not_subscribed', stratum_code: 25, method })
exports.JOBID_MALFORMAT = (job_id) => ({ connectbtc_code: 'jobid_malformat', stratum_code: 21, job_id }) // eslint-disable-line camelcase
exports.JOB_NOT_FOUND = (job_id) => ({ connectbtc_code: 'job_not_found', stratum_code: 21, job_id }) // eslint-disable-line camelcase
exports.NONCE_MALFORMAT = (nonce) => ({ connectbtc_code: 'nonce_malformat', stratum_code: 20, nonce })
exports.NTIME_MALFORMAT = (ntime) => ({ connectbtc_code: 'ntime_malformat', stratum_code: 20, ntime })
exports.NTIME_OUT_OF_RANGE = (template_id, template_time, ntime) => ({ connectbtc_code: 'ntime_out_of_range', stratum_code: 20, ntime, template_time, template_id }) // eslint-disable-line camelcase
exports.EXTRA_NONCE_2_MALFORMAT = (extra_nonce_2) => ({ connectbtc_code: 'extra_nonce2_malformat', stratum_code: 20, extra_nonce_2 }) // eslint-disable-line camelcase
exports.LOW_DIFFICULTY_SHARE = (worker_id = '', template_id, needed, got) => ({ connectbtc_code: 'low_difficulty_share', stratum_code: 23, worker_id, template_id, needed, got }) // eslint-disable-line camelcase
exports.DUPLICATE_SHARE = (worker_id = '', hash) => ({ connectbtc_code: 'duplicate_share', stratum_code: 22, worker_id, hash }) // eslint-disable-line camelcase
exports.UNIDENTIFIED_METHOD = (method) => ({ connectbtc_code: 'unidentified_method', stratum_code: 20, method })
exports.JSON_PARSING = (line) => ({ connectbtc_code: 'json_parsing_error', stratum_code: 20, line })
exports.METHOD_TIME_OUT = (method) => ({ connectbtc_code: 'method_time_out', stratum_code: 21, method })
