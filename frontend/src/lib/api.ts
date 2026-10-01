/** Sends the user back to sign in when the session has expired. */
export const redirectIfUnauthorized = (response: Response) => {
  if (response.status === 401) {
    window.location.assign("/login");
  }
};
