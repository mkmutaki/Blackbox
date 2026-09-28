| Requirement ID | Description | User Story | Expected Behavior/Outcome |
|----------------|-------------|------------|---------------------------|
| **FR001**      | Creating a video entry | As a user, I want to be able to begin recording a video entry using my pc or laptop camera once the camera button is clicked. | The system should immediately begin capturing a clear recording with no lag. |
| **FR002**      | Pause and resume video entry | As a user, I want to be able to pause and resume the video entry without it ever stopping. | The system should provide the capability to pause a video entry mid-recording and resume it when needed. |
| **FR003**      | Stop video entry | As a user, I should be able to stop the entry and have playback buttons shown after this (play, pause, rewind, fast forward). | The system should allow a user to stop a video entry. Once stopped, the user should be provided with the playback buttons. |
| **FR004**      | Save video entry in a list | As a user, I should be able to save the video recording with the save button. | The system should save the encrypted version of the video with associated metadata to the database when the save button is pressed. |
| **FR005**      | Delete video entry | As a user, I should be able to delete a video if needed with the delete button. | The system should delete the video and allow a user to make a new one when the delete button is pressed. |
| **FR006**      | View saved videos on "previous entries" list | As a user, I should be able to playback previously saved videos on the "previous entries" list. | The system should allow encrypted playback of previously saved videos. |
| **FR007**      | Delete saved videos on "previous entries" list | As a user, I should be able to delete a previously saved video using the delete button. | The system should delete the video from the database when the button is clicked. A user should be prompted with a "confirm deletion" message before full deletion. |

### Additional Requirements
- System should:
  - Generate sequential log entry numbers
  - Track mission days (SOL day counter which begins from January 1st onwards)
  - Timestamp each entry
  - Categorize log entries according to SOL day recorded

### Future considerations
- Keep in mind that while implementing these, the application will require users to create accounts before being able to record video entries. These video entries will belong only to the user's account and be accessible only when logged in.
