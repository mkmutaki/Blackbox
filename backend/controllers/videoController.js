const videoService = require('../services/videoService');

// @route   POST /api/videos/presign
// @desc    Get a presigned POST so the browser can upload the encrypted
//          video straight to S3 — Express never buffers the file.
// @access  Private
const presign = async (req, res) => {
  try {
    res.json(await videoService.createUploadTarget(req.user.userId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   POST /api/videos/finalize
// @desc    Confirm the upload actually landed in S3, then write the DB
//          record. Called after the browser's direct-to-S3 upload succeeds.
// @access  Private
const finalize = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { key, iv, jwk, title } = req.body;

    // Defence in depth: the key was server-generated under this user's own
    // prefix at /presign time — reject anything else even though a
    // mismatched key could never have a valid upload behind it.
    if (!videoService.isOwnUploadKey(userId, key)) {
      return res.status(403).json({ error: 'Invalid upload key' });
    }

    if (!(await videoService.uploadExists(key))) {
      return res.status(400).json({ error: 'Upload not found — please record and save again' });
    }

    let parsedJwk;
    try {
      parsedJwk = JSON.parse(jwk);
    } catch (parseError) {
      return res.status(400).json({ error: 'Invalid jwk' });
    }

    const video = await videoService.createVideoRecord({ ownerId: userId, key, iv, jwk: parsedJwk, title });

    res.status(201).json({ id: video._id, entryNumber: video.entryNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   GET /api/videos
// @desc    Get all encrypted videos with signed URLs for the current user
// @access  Private
const listVideos = async (req, res) => {
  try {
    const videos = await videoService.findVideosByOwner(req.user.userId);
    res.json(await Promise.all(videos.map(videoService.toOwnerVideoView)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   GET /api/videos/:id
// @desc    Get a specific video by ID
// @access  Private
const getVideo = async (req, res) => {
  try {
    const video = await videoService.findOwnedVideo(req.user.userId, req.params.id);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    res.json(await videoService.toOwnerVideoView(video));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   PATCH /api/videos/:id
// @desc    Update video title
// @access  Private
const updateVideoTitle = async (req, res) => {
  try {
    const video = await videoService.findOwnedVideo(req.user.userId, req.params.id);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    await videoService.renameVideo(video, req.body.title);

    res.json({ message: 'Video updated successfully', video: { id: video._id, title: video.title } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   DELETE /api/videos/:id
// @desc    Delete a video
// @access  Private
const deleteVideo = async (req, res) => {
  try {
    const video = await videoService.findOwnedVideo(req.user.userId, req.params.id);

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    await videoService.deleteVideo(video);

    res.json({ message: 'Video deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { presign, finalize, listVideos, getVideo, updateVideoTitle, deleteVideo };
