REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM authenticated;