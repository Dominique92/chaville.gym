<a href="index.php?logout" style="float:right">Déconnection</a>
<h3>Archives de Chavil'GYM</h3>

<?php
//TODO diffusion des attestations
error_reporting(E_ALL);
ini_set('display_errors','on');

include 'liste.php';
include 'texte_mail.php';

$nomAnimateurs = $mailAnimateurs = [];
foreach ($animateurs AS $k=>$v) {
	$nomAnimateurs [str_replace (['é','è'], 'e', $v)] = $v;
	$mailAnimateurs [str_replace (['é','è'], 'e', $v)] = $k;
}

$mois = [
	'01' => 'janvier',
	'02' => 'février',
	'03' => 'mars',
	'04' => 'avril',
	'05' => 'mai',
	'06' => 'juin',
	'07' => 'juillet',
	'08' => 'aout',
	'09' => 'septembre',
	'10' => 'octobre',
	'11' => 'novembre',
	'12' => 'décembre',
];

/**
 * Identification
 */
$session_mail = @$_POST['session_mail'] ?: @$_COOKIE['session_mail'];
$session_id = @$_GET['session_id'] ?: @$_COOKIE['session_id'];

if (isset($_GET['logout']))
	$session_mail = null;

$prenom = @($bureau + $animateurs)[$session_mail];
if ($session_mail && !$prenom) {
	?><p style="color:red">Mail <b><?=$session_mail?></b> inconnu.<p><?
	$session_mail = null;
}
$est_bureau = isset ($bureau[$session_mail]);
$salt = $session_mail.$_SERVER['REMOTE_ADDR'].$_SERVER['HTTP_USER_AGENT'];
$md5 = md5($salt);

if (!$prenom) { ?>
	<p>Pour vous identifier, saisissez votre adresse mail :</p>
	<form action="index.php" method="POST">
		<p><input type="text" name="session_mail" size="50" /></p>
		<p><input type="submit" value="Soumettre" /></p>
	</form> <?
}

if ($prenom && $session_id != $md5) {
	if ($est_bureau) {
		$prenom = null;

		// Envoi d'un mail de validation
		$_POST['send_address'] = $session_mail;
		$_POST['send_subject'] = 'Validation de votre connexion à chavil.gym';
		$_POST['send_body'] = "Pour valider votre connexion à chavil.gym,
cliquez sur https://{$_SERVER['SERVER_NAME']}{$_SERVER['REQUEST_URI']}?session_id=$md5";
		$_POST['send_confirm'] = 'Un mail de vérification de votre connexion vient de vous être envoyé.';
	}
	// Les animateurs n'ont pas besoin de valider
	else
		$session_id = $md5;
}

/**
 * Envoi d'un mail
 */
if (isset ($_POST['send_address'])) {
	if (isset (($bureau + $animateurs)[$_POST['send_address']])) { // Seulement vers des mails connus
		$send_subject = explode ('<', $_POST['send_subject']);

		preg_match('/([0-9]*)-([0-9]*)-/', @$_POST['send_attachment'], $an_mois);
		if (count ($send_subject) && count ($an_mois))
			$_POST['send_subject'] = $send_subject[0].$mois[$an_mois[2]].' '.$an_mois[1].' ';

		include 'PHPMailer/PHPMailerAutoload.php'; //https://github.com/PHPMailer/PHPMailer
		$mailer = new PHPMailer;
		$mailer->CharSet = 'UTF-8';
		$mailer->SMTPDebug = 3; // Enable verbose debug output
		$mailer->FromName = 'Chavil\'GYM';
		$mailer->From = 'chavil.gym@cavailhez.fr';
		$mailer->addAddress ($_POST['send_address']);
		$mailer->addBCC('chavil.gym@cavailhez.fr');
		$mailer->Subject = $_POST['send_subject'] ?: 'Chavil\'GYM';
		$mailer->Body = $_POST['send_body'];
		if (isset ($_POST['send_attachment']))
			$mailer->AddAttachment ($_POST['send_attachment']);

		if ($mailer->ErrorInfo)
			echo"<p style='color:red'>Erreur envoi mail : {$mailer->ErrorInfo}</p>";
		else {
			$mailer->Send();
			echo "<p style='color:red'>{$_POST['send_confirm']}</p>";

			if (isset ($_POST['send_attachment']))
				file_put_contents ('texte_mail.php',
					"\n\$texte_edit_liste = \"{$_POST['send_body']}\";\n",
					FILE_APPEND);
		}
	} else
		echo "<p style='color:red'>Mail <b><?=$send_address?></b> inconnu.<p>";
}

/**
 * Acceuil
 */
if ($prenom) {
	if (!count ($_GET))
		echo "<p>Bonjour $prenom</p><hr />";
} else
	exit;

/**
 * Trésorier : upload files
 */
if ($est_bureau && !isset ($_GET['prenom'])) { ?>
	<form method="post" enctype="multipart/form-data">
		<b>Archiver des bulletins</b><br />(Ctrl+click pour multiple)<br />
		<input type="file" id="file" name="file[]" multiple ="true">
		<button>Envoyer</button>
	</form>

	<? 
	include 'PdfParser.php'; // https://gist.github.com/smalot/6183152
	if (isset ($_FILES['file']))
		foreach ($_FILES['file']['name'] AS $k=>$f) {
			$tmp = $_FILES['file']['tmp_name'][$k];
			$pdf = PdfParser::parseFile ($tmp);
			preg_match('/emploi : du ([0-9]+)\/([0-9]+)\/([0-9]+)/', $pdf, $date);
			preg_match('/Prénom-:-(.+)-Nom-:/', str_replace (' ', '-', $pdf), $prenom_compose);

			if (count($date) < 4 || count($prenom_compose) < 2) return;

			$prenoms = explode('-',$prenom_compose[1]);
			foreach ($prenoms AS $k=>$v)
				$prenoms[$k] = ucfirst (str_replace (['é','è'], 'e', mb_strtolower ($v, 'UTF-8')));

			$local_file_name = '20'.$date[3].'-'.$date[2].'-'.implode('-', $prenoms).'.pdf';

			// Copy file
			$mouvement = file_exists('pdf/'.$local_file_name) ? 'remplacé' : 'archivé';
			$ok = move_uploaded_file($tmp, 'pdf/'.$local_file_name);
			if ($ok)
				echo "<p style='color:red'>Le fichier <b>$local_file_name</b> à été $mouvement.</p>";
			else
				echo "<p style='color:red'>Erreur d'archivage du fichier <b>$local_file_name</b>.</p>";
		}

/**
 * Trésorier : liste des employés
 */
	?><hr />
	<b>Envoyer un bulletin à :</b><br />
	<?

	foreach ($animateurs AS $mail => $prenom) {
		$prenom_flat = str_replace(['é','è',' '], ['e','e','-'], $prenom);
		echo "<a href='./?prenom=$prenom_flat'>$prenom</a><br />";
	}
}

/**
 * Liste des bulletins d'un employé
 */
// Envoi des bulletins par le trésorier
if ($est_bureau) {
	$prenom_liste = @$_GET['prenom'];
	$intro_liste = '<b>Pour envoyer un bulletin de paie à '.$prenom_liste.
		'</b> :<br/><br/><b>Modifiez le texte<b><br/>';
	$mail_liste = @$mailAnimateurs [$prenom_liste];
	$titre_liste = "Bulletin de paie de $prenom_liste pour <MOIS_BULLETIN>";

	foreach ($animateurs AS $nouveau_prenom)
		$texte_edit_liste = str_replace ($nouveau_prenom, $prenom_liste, $texte_edit_liste);

	echo '<hr />';
}
// Récupération d'un bulletin par un employé
else {
	$intro_liste = '<b>Pour obtenir une copie d\'un bulletin de paie :</b><br/>';
	$prenom_liste = $prenom;
	$mail_liste = $session_mail;
	$titre_liste = 'Votre document Chavil\'GYM';
	$texte_liste = "Bonjour $prenom_liste.

Veuillez trouver ci-joint le document demandé.

Cordialement.

Chavil'GYM

NOTE: Vous recevez ce mail parce qu'une demande à été postée sur le site d'archives de Chavil'GYM.
Si cette demande ne provient pas de vous, supprimez ce mail.
Si ces envois persistent, signalez-le moi en répondant à ce mail.";
}

if ($prenom_liste) {
	$prenom_liste_flat = str_replace(['é','è'], 'e', $prenom_liste);
	$files = glob('pdf/*'.$prenom_liste_flat.'.pdf');
?>
	<form action="index.php" method="POST">
		<?=$intro_liste?>

		<input type="hidden" name="send_address" value="<?=$mail_liste?>" />
		<input type="hidden" name="send_subject" value="<?=$titre_liste?>" />
		<input type="hidden" name="send_confirm" value="Votre document a été envoyé à <?=$mail_liste?>." />
		<? if (isset ($texte_liste)) { ?>
			<input type="hidden" name="send_body" value="<?=$texte_liste?>" />
		<? } else { ?>
			<textarea name="send_body" rows="15" cols="80"><?=$texte_edit_liste?></textarea><br/><br/>
		<? } ?>

		<br /><b>Sélectionnez le document dans la liste ci-dessous</b><br/>
		<? if ($files)
			foreach (array_reverse($files) AS $k=>$f) {
				$nf = explode ('-', str_replace ('/', '-', $f));
				?>
				<input type="radio" name="send_attachment"
					value="<?=$f?>" <?=$k?'':'checked="checked"'?> />
				<?=ucfirst($mois[$nf[2]]).' '.$nf[1]?>
				<br><?
			}
		?>

		<br/><b>Puis</b><br/>
		<input type="submit" style="cursor:pointer;display:inline-block"
			title="Cliquez pour recevoir le document par mail"
			value="envoyer à <?=$mail_liste?>" />
		<br /><br />
	</form>
<? }

